import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper logging function for debugging
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");
    
    // Verificar variáveis de ambiente
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!stripeSecretKey || !supabaseUrl || !supabaseServiceKey) {
      logStep("ERROR: Missing environment variables", {
        hasStripe: !!stripeSecretKey,
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey
      });
      throw new Error("Server configuration incomplete");
    }
    
    logStep("Environment variables verified");
    
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseServiceKey,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("ERROR: No authorization header");
      throw new Error("No authorization header provided");
    }
    
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      logStep("ERROR: Authentication failed", { error: userError.message });
      
      // Return 401 for authentication errors instead of 500
      return new Response(JSON.stringify({ 
        error: "Authentication failed",
        details: userError.message 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    
    const user = userData.user;
    if (!user?.email) {
      logStep("ERROR: User not authenticated or no email");
      
      // Return 401 for invalid user data
      return new Response(JSON.stringify({ 
        error: "User not authenticated or email unavailable" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    
    logStep("User authenticated", { userId: user.id, email: user.email });

    let planSlug;
    
    try {
      const url = new URL(req.url);
      
      logStep("Request details", { 
        method: req.method,
        contentType: req.headers.get('content-type'),
        hasSearchParams: url.searchParams.toString() !== ''
      });
      
      // Try to get planSlug from query parameters first
      planSlug = url.searchParams.get('planSlug');
      if (planSlug) {
        logStep("Plan slug found in query parameters", { planSlug });
      }
      
      // Then try to read from request body
      try {
        const requestBody = await req.json();
        logStep("Successfully parsed request body", { requestBody });
        
        if (requestBody?.planSlug) {
          planSlug = requestBody.planSlug;
          logStep("Plan slug found in request body", { planSlug });
        }
      } catch (bodyError) {
        logStep("Failed to parse request body as JSON", { 
          error: bodyError instanceof Error ? bodyError.message : String(bodyError)
        });
        // Continue with planSlug from query params if body parsing fails
      }
      
    } catch (parseError) {
      logStep("ERROR: Failed to process request", { 
        error: parseError instanceof Error ? parseError.message : String(parseError),
        stack: parseError instanceof Error ? parseError.stack : undefined
      });
      throw new Error(`Request processing error: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    
    if (!planSlug) {
      logStep("ERROR: No plan slug provided in body or query params");
      throw new Error("Plan slug is required in request body or as query parameter 'planSlug'");
    }
    
    logStep("Plan slug received", { planSlug });

    // Get the plan details
    const { data: plan, error: planError } = await supabaseClient
      .from('subscription_plans')
      .select('*')
      .eq('slug', planSlug)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      logStep("ERROR: Plan not found", { planSlug, error: planError?.message });
      throw new Error("Plan not found");
    }
    
    logStep("Plan found", { planId: plan.id, planName: plan.name, priceId: plan.stripe_price_id });

    // Count teacher's students
    const { count: studentCount, error: countError } = await supabaseClient
      .from('teacher_student_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', user.id);

    if (countError) {
      logStep("ERROR: Failed to count students", { error: countError.message });
      throw new Error("Failed to count students");
    }

    const totalStudents = studentCount || 0;
    logStep("Student count retrieved", { totalStudents });

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });
    
    logStep("Stripe client initialized");

    // Check for active subscription and cancel it before creating new checkout
    const { data: existingSubscription, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select('*, subscription_plans(*)')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .single();

    if (existingSubscription && !subError) {
      logStep("Active subscription found, will be cancelled", { 
        subscriptionId: existingSubscription.stripe_subscription_id,
        currentPlan: existingSubscription.subscription_plans?.name
      });

      // Cancel the existing Stripe subscription immediately
      if (existingSubscription.stripe_subscription_id) {
        try {
          const cancelledSubscription = await stripe.subscriptions.cancel(
            existingSubscription.stripe_subscription_id
          );
          
          logStep("Stripe subscription cancelled successfully", { 
            subscriptionId: cancelledSubscription.id,
            status: cancelledSubscription.status 
          });

          // Update subscription status in database
          const { error: updateError } = await supabaseClient
            .from('user_subscriptions')
            .update({ 
              status: 'cancelled',
              cancel_at_period_end: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingSubscription.id);

          if (updateError) {
            logStep("WARNING: Failed to update subscription status in DB", { 
              error: updateError.message 
            });
          } else {
            logStep("Database subscription status updated to cancelled");
          }

          // Cancelar faturas pendentes se o novo plano não tiver módulo financeiro
          if (!plan.features?.financial_module) {
            logStep("New plan does not have financial module, cancelling pending invoices");
            
            const { data: pendingInvoices, error: invoicesError } = await supabaseClient
              .from('invoices')
              .select('id')
              .eq('teacher_id', user.id)
              .eq('status', 'pendente');

            if (invoicesError) {
              logStep("WARNING: Failed to fetch pending invoices", { 
                error: invoicesError.message 
              });
            } else if (pendingInvoices && pendingInvoices.length > 0) {
              const { error: cancelInvoicesError } = await supabaseClient
                .from('invoices')
                .update({ 
                  status: 'cancelada_por_mudanca_plano',
                  updated_at: new Date().toISOString()
                })
                .eq('teacher_id', user.id)
                .eq('status', 'pendente');

              if (cancelInvoicesError) {
                logStep("WARNING: Failed to cancel pending invoices", { 
                  error: cancelInvoicesError.message 
                });
              } else {
                logStep("Pending invoices cancelled successfully", { 
                  count: pendingInvoices.length 
                });
              }
            } else {
              logStep("No pending invoices to cancel");
            }
          }
        } catch (cancelError) {
          logStep("ERROR: Failed to cancel Stripe subscription", { 
            error: cancelError instanceof Error ? cancelError.message : String(cancelError) 
          });
          // Continue with checkout creation even if cancellation fails
          // The user was warned about the immediate cancellation
        }
      }
    } else {
      logStep("No active subscription found, proceeding with new subscription");
    }
    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing Stripe customer found", { customerId });
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
      logStep("New Stripe customer created", { customerId });
    }

    // Create Stripe price if not exists
    let stripePriceId = plan.stripe_price_id;
    
    if (!stripePriceId) {
      logStep("Creating Stripe product and price", { planName: plan.name, priceCents: plan.price_cents });
      
      const product = await stripe.products.create({
        name: `TutorFlow - ${plan.name}`,
        description: `Plano ${plan.name} do TutorFlow`
      });
      
      logStep("Stripe product created", { productId: product.id });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price_cents,
        currency: 'brl',
        recurring: {
          interval: plan.billing_interval as any
        }
      });

      stripePriceId = price.id;
      logStep("Stripe price created", { priceId: stripePriceId });

      // Update plan with Stripe price ID
      const { error: updateError } = await supabaseClient
        .from('subscription_plans')
        .update({ stripe_price_id: stripePriceId })
        .eq('id', plan.id);
        
      if (updateError) {
        logStep("ERROR: Failed to update plan with price ID", { error: updateError.message });
      } else {
        logStep("Plan updated with Stripe price ID");
      }
    } else {
      logStep("Using existing Stripe price", { priceId: stripePriceId });
    }

    // Get price details to check usage type
    const priceDetails = await stripe.prices.retrieve(stripePriceId);
    logStep("Price details retrieved", { 
      priceId: stripePriceId, 
      usageType: priceDetails.recurring?.usage_type 
    });

    // Create checkout session
    logStep("Creating Stripe checkout session", { 
      customerId, 
      priceId: stripePriceId,
      origin: req.headers.get("origin"),
      usageType: priceDetails.recurring?.usage_type
    });
    
    // Build line item - don't include quantity for metered pricing
    const lineItem: any = {
      price: stripePriceId,
    };
    
    // Only add quantity for non-metered pricing
    if (priceDetails.recurring?.usage_type !== 'metered') {
      lineItem.quantity = totalStudents > 0 ? totalStudents : 1; // Use total student count or minimum of 1
    }
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [lineItem],
      mode: 'subscription',
      payment_method_types: ['card', 'boleto'],
      success_url: `${req.headers.get("origin") || "https://www.tutor-flow.app"}/subscription?success=true`,
      cancel_url: `${req.headers.get("origin") || "https://www.tutor-flow.app"}/planos?canceled=true`,
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
        plan_id: plan.id,
        student_count: totalStudents.toString()
      }
    });
    
    logStep("Checkout session created successfully", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-subscription-checkout", { message: errorMessage, stack: error instanceof Error ? error.stack : undefined });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
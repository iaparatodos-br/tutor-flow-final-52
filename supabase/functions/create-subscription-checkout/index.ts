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
      throw new Error(`Authentication error: ${userError.message}`);
    }
    
    const user = userData.user;
    if (!user?.email) {
      logStep("ERROR: User not authenticated or no email");
      throw new Error("User not authenticated or email not available");
    }
    
    logStep("User authenticated", { userId: user.id, email: user.email });

    let requestBody;
    let planSlug;
    
    try {
      // Check if request has a body
      const contentLength = req.headers.get('content-length');
      logStep("Request headers", { 
        contentType: req.headers.get('content-type'),
        contentLength: contentLength 
      });
      
      if (!contentLength || contentLength === '0') {
        logStep("ERROR: No content in request body");
        throw new Error("Request body is required");
      }
      
      // Clone the request to read the body safely
      const clonedRequest = req.clone();
      const bodyText = await clonedRequest.text();
      
      logStep("Raw request body", { 
        bodyText: bodyText,
        bodyLength: bodyText.length 
      });
      
      if (!bodyText || bodyText.trim() === '') {
        logStep("ERROR: Empty or whitespace-only request body");
        throw new Error("Request body cannot be empty");
      }
      
      requestBody = JSON.parse(bodyText);
      logStep("Successfully parsed request body", { requestBody });
      
      planSlug = requestBody.planSlug;
      
    } catch (parseError) {
      logStep("ERROR: Failed to parse request", { 
        error: parseError instanceof Error ? parseError.message : String(parseError),
        stack: parseError instanceof Error ? parseError.stack : undefined
      });
      throw new Error(`Invalid request format: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    
    if (!planSlug) {
      logStep("ERROR: No plan slug provided", { body: requestBody });
      throw new Error("Plan slug is required in request body");
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

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });
    
    logStep("Stripe client initialized");

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

    // Create checkout session
    logStep("Creating Stripe checkout session", { 
      customerId, 
      priceId: stripePriceId,
      origin: req.headers.get("origin")
    });
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.get("origin") || "http://localhost:3000"}/subscription?success=true`,
      cancel_url: `${req.headers.get("origin") || "http://localhost:3000"}/planos?canceled=true`,
      metadata: {
        user_id: user.id,
        plan_id: plan.id
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
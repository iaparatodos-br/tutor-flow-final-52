import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper logging function for enhanced debugging
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Helper function to check if user needs student selection for plan downgrade
const checkNeedsStudentSelection = async (
  supabaseClient: any,
  userId: string,
  newPlan: any,
  currentPlan: any
) => {
  try {
    // Only check if going to a plan with fewer student slots
    if (newPlan.student_limit >= currentPlan.student_limit) {
      return null;
    }

    // Get current student count
    const { data: students, error: studentsError } = await supabaseClient
      .from('teacher_student_relationships')
      .select(`
        id,
        student_id,
        student_name,
        created_at,
        profiles!teacher_student_relationships_student_id_fkey(name, email)
      `)
      .eq('teacher_id', userId);

    if (studentsError) {
      logStep("Error fetching students for downgrade check", { error: studentsError });
      return null;
    }

    if (!students || students.length <= newPlan.student_limit) {
      return null; // No selection needed
    }

    logStep("Student selection needed", {
      currentCount: students.length,
      newLimit: newPlan.student_limit,
      needToRemove: students.length - newPlan.student_limit
    });

    return {
      students: students.map(s => ({
        id: s.student_id,
        relationship_id: s.id,
        name: s.student_name || s.profiles.name,
        email: s.profiles.email,
        created_at: s.created_at
      })),
      current_count: students.length,
      target_limit: newPlan.student_limit,
      need_to_remove: students.length - newPlan.student_limit
    };
  } catch (error) {
    logStep("Exception in checkNeedsStudentSelection", { error: error.message });
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      logStep("Authentication failed", { 
        error: userError?.message, 
        hasUser: !!userData.user 
      });
      
      // Return 401 for authentication errors so frontend can handle logout
      return new Response(JSON.stringify({ 
        error: "Authentication failed", 
        code: "INVALID_SESSION" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    
    const user = userData.user;
    if (!user?.email) {
      logStep("User email not available");
      return new Response(JSON.stringify({ 
        error: "User email not available" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get user's current subscription from database (active or expired for student selection check)
    const { data: subscription, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select(`
        *,
        subscription_plans (*)
      `)
      .eq('user_id', user.id)
      .in('status', ['active', 'expired'])
      .order('updated_at', { ascending: false })
      .maybeSingle();

    if (subError) throw subError;

    if (subscription) {
      logStep("Found active subscription in database", { 
        subscriptionId: subscription.id, 
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end 
      });
      
      let paymentFailure = null;

      // If we have a Stripe subscription ID, check its status for payment failures
      if (subscription.stripe_subscription_id) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
          logStep("Retrieved Stripe subscription", { 
            status: stripeSubscription.status,
            pastDue: stripeSubscription.status === 'past_due'
          });

          // Check if subscription is in past_due or other failure states
          if (stripeSubscription.status === 'past_due' || 
              stripeSubscription.status === 'canceled' ||
              stripeSubscription.status === 'incomplete_expired') {
            
            // Get latest invoice to check failure details
            const invoices = await stripe.invoices.list({
              customer: stripeSubscription.customer as string,
              limit: 5,
              status: 'open'
            });

            const failedInvoice = invoices.data.find(inv => inv.status === 'open' && inv.attempt_count > 0);
            
            paymentFailure = {
              detected: true,
              status: stripeSubscription.status,
              lastFailureDate: failedInvoice?.status_transitions?.payment_failed_at ? 
                new Date(failedInvoice.status_transitions.payment_failed_at * 1000).toISOString() : null,
              attemptsCount: failedInvoice?.attempt_count || 0,
              nextAttempt: failedInvoice?.next_payment_attempt ? 
                new Date(failedInvoice.next_payment_attempt * 1000).toISOString() : null
            };

            logStep("Payment failure detected", paymentFailure);
          }
        } catch (stripeError) {
          logStep("Error checking Stripe subscription status", { error: stripeError });
          // Continue without payment failure data
        }
      }
      
      // Check if active subscription is expired
      const now = new Date();
      const periodEnd = new Date(subscription.current_period_end);
      
      if ((subscription.status === 'active' && now > periodEnd) || subscription.status === 'expired') {
        logStep("Subscription is expired or expired status detected, checking for student selection need");
        
        // Update subscription status to expired (only if it's still active)
        if (subscription.status === 'active') {
          const { error: updateError } = await supabaseClient
            .from('user_subscriptions')
            .update({
              status: 'expired',
              updated_at: now.toISOString()
            })
            .eq('id', subscription.id);

          if (updateError) {
            logStep("Error updating subscription status", { error: updateError });
            throw updateError;
          }
        }

        // Get free plan
        const { data: freePlan, error: freePlanError } = await supabaseClient
          .from('subscription_plans')
          .select('*')
          .eq('slug', 'free')
          .single();

        if (freePlanError || !freePlan) {
          logStep("Error getting free plan", { error: freePlanError });
          throw freePlanError;
        }

        // Update user profile to free plan
        const { error: profileUpdateError } = await supabaseClient
          .from('profiles')
          .update({
            current_plan_id: freePlan.id,
            subscription_status: 'expired',
            updated_at: now.toISOString(),
          })
          .eq('id', user.id);

        if (profileUpdateError) {
          logStep("Error updating user profile", { error: profileUpdateError });
          throw profileUpdateError;
        }

        // Check if user needs to select students for plan downgrade
        const needsStudentSelection = await checkNeedsStudentSelection(
          supabaseClient,
          user.id,
          freePlan,
          subscription.subscription_plans
        );

        if (needsStudentSelection) {
          logStep("User needs to select students for plan downgrade");
          
          return new Response(JSON.stringify({
            subscription: null,
            plan: freePlan,
            needs_student_selection: true,
            current_students: needsStudentSelection.students,
            previous_plan: subscription.subscription_plans
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }

        // Check if user is professor with financial module and process cancellation
        if (subscription.subscription_plans?.features?.financial_module === true) {
          logStep("User had financial module, processing teacher cancellation");
          
          try {
            const { error: cancellationError } = await supabaseClient.functions.invoke(
              'handle-teacher-subscription-cancellation',
              {
                body: {
                  teacher_id: user.id,
                  cancellation_reason: 'subscription_expired',
                  previous_plan_features: subscription.subscription_plans.features
                }
              }
            );

            if (cancellationError) {
              logStep("Error in teacher cancellation process", { error: cancellationError });
            } else {
              logStep("Teacher subscription cancellation processed successfully");
            }
          } catch (cancellationError) {
            logStep("Exception in teacher cancellation process", { error: cancellationError });
          }
        }

        logStep("Subscription marked as expired and profile updated");

        return new Response(JSON.stringify({
          subscription: null,
          plan: freePlan
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      
      logStep("Active subscription found in database", { subscriptionId: subscription.id });
      // Return active subscription with payment failure data if detected
      return new Response(JSON.stringify({
        subscription: {
          id: subscription.id,
          plan_id: subscription.plan_id,
          status: subscription.status,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
          extra_students: subscription.extra_students,
          extra_cost_cents: subscription.extra_cost_cents
        },
        plan: subscription.subscription_plans,
        paymentFailure: paymentFailure
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("No subscription in database, checking Stripe");

    // No subscription in database - check Stripe directly
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    
    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No Stripe customer found, returning free plan");
      
      // Get free plan
      const { data: freePlan } = await supabaseClient
        .from('subscription_plans')
        .select('*')
        .eq('slug', 'free')
        .single();

      return new Response(JSON.stringify({
        subscription: null,
        plan: freePlan
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Get active subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    
    const hasActiveSub = subscriptions.data.length > 0;
    
    if (!hasActiveSub) {
      logStep("No active subscription in Stripe");
      // Get free plan
      const { data: freePlan } = await supabaseClient
        .from('subscription_plans')
        .select('*')
        .eq('slug', 'free')
        .single();

      return new Response(JSON.stringify({
        subscription: null,
        plan: freePlan
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Active subscription found in Stripe - sync to database ONLY if no local subscription exists
    const stripeSubscription = subscriptions.data[0];
    logStep("Active subscription found in Stripe", { 
      subscriptionId: stripeSubscription.id, 
      status: stripeSubscription.status 
    });

    // Get price_id and map to subscription plan
    const priceId = stripeSubscription.items.data[0].price.id;
    logStep("Found price_id", { priceId });

    const { data: plan, error: planError } = await supabaseClient
      .from('subscription_plans')
      .select('*')
      .eq('stripe_price_id', priceId)
      .single();

    if (planError || !plan) {
      logStep("Plan not found for price_id", { priceId, error: planError });
      throw new Error(`Plan not found for price_id: ${priceId}`);
    }

    logStep("Found plan for subscription", { planId: plan.id, planName: plan.name });

    // Create subscription record in database (upsert to handle refresh cases)
    const subscriptionData = {
      user_id: user.id,
      plan_id: plan.id,
      status: 'active',
      stripe_customer_id: customerId,
      stripe_subscription_id: stripeSubscription.id,
      current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: stripeSubscription.cancel_at_period_end,
      extra_students: 0,
      extra_cost_cents: 0,
      updated_at: new Date().toISOString(),
    };

    const { data: newSubscription, error: upsertError } = await supabaseClient
      .from('user_subscriptions')
      .upsert(subscriptionData, { onConflict: 'user_id' })
      .select()
      .single();

    if (upsertError) {
      logStep("Error upserting subscription", { error: upsertError });
      throw upsertError;
    }

    // Update user profile
    await supabaseClient
      .from('profiles')
      .update({
        current_plan_id: plan.id,
        subscription_status: 'active',
        subscription_end_date: subscriptionData.current_period_end,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    logStep("Successfully synced subscription from Stripe to database", { 
      subscriptionId: newSubscription.id,
      planId: plan.id 
    });

    return new Response(JSON.stringify({
      subscription: {
        id: newSubscription.id,
        plan_id: newSubscription.plan_id,
        status: newSubscription.status,
        current_period_end: newSubscription.current_period_end,
        cancel_at_period_end: newSubscription.cancel_at_period_end,
        extra_students: newSubscription.extra_students,
        extra_cost_cents: newSubscription.extra_cost_cents
      },
      plan: plan
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logStep("ERROR in check-subscription", { 
      message: errorMessage, 
      stack: errorStack,
      timestamp: new Date().toISOString()
    });
    
    return new Response(JSON.stringify({ 
      error: 'Erro interno do servidor',
      details: errorMessage,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
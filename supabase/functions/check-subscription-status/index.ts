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
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get user's current subscription from database
    const { data: subscription, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select(`
        *,
        subscription_plans (*)
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (subError) throw subError;

    if (subscription) {
      logStep("Active subscription found in database", { subscriptionId: subscription.id });
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
        plan: subscription.subscription_plans
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("No active subscription in database, checking Stripe");

    // No subscription in database - check Stripe directly
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    
    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No Stripe customer found, updating unsubscribed state");
      await supabaseClient.from("user_subscriptions").upsert({
        user_id: user.id,
        plan_id: null,
        status: 'cancelled',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        extra_students: 0,
        extra_cost_cents: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      
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

    // Active subscription found in Stripe - sync to database
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

    // Create subscription record in database
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
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CANCEL-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    if (!user) throw new Error("User not authenticated");

    logStep("User authenticated", { userId: user.id });

    // Verify user is a professor
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'professor') {
      throw new Error("Only professors can manage subscriptions");
    }

    logStep("Professor role verified");

    // Get the action (cancel or reactivate)
    const { action } = await req.json();
    const cancelAtPeriodEnd = action === 'cancel';

    logStep("Action received", { action, cancelAtPeriodEnd });

    // Get the user's subscription from database
    const { data: subscription, error: dbError } = await supabaseClient
      .from('user_subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (dbError || !subscription?.stripe_subscription_id) {
      throw new Error("Assinatura ativa não encontrada.");
    }

    const stripeSubscriptionId = subscription.stripe_subscription_id;
    logStep("Found active subscription", { stripeSubscriptionId });

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Update the subscription in Stripe
    const updatedStripeSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    logStep("Stripe subscription updated", { 
      cancel_at_period_end: updatedStripeSubscription.cancel_at_period_end 
    });

    // Update our local database
    const { error: updateDbError } = await supabaseClient
      .from('user_subscriptions')
      .update({
        cancel_at_period_end: updatedStripeSubscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', stripeSubscriptionId);

    if (updateDbError) {
      throw new Error(`Erro ao atualizar o banco de dados: ${updateDbError.message}`);
    }

    logStep("Database updated successfully");

    return new Response(JSON.stringify({ 
      success: true, 
      cancel_at_period_end: updatedStripeSubscription.cancel_at_period_end 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
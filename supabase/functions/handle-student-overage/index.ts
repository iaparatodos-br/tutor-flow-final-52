import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STUDENT-OVERAGE] ${step}${detailsStr}`);
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
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    logStep("User authenticated", { userId: user.id, email: user.email });

    const { extraStudents, planLimit } = await req.json();

    // Calculate extra cost (R$ 5 per additional student)
    const extraCostCents = extraStudents * 500; // R$ 5.00 = 500 cents

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Get current subscription
    const { data: subscriptionData, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select('stripe_subscription_id, stripe_customer_id, plan_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (subError || !subscriptionData?.stripe_subscription_id) {
      logStep("No active subscription found, proceeding without billing");
      return new Response(JSON.stringify({ 
        success: true,
        message: "No active subscription - student added without additional billing"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Found subscription", { subscriptionId: subscriptionData.stripe_subscription_id });

    // Check if we already have an overage line item
    const subscription = await stripe.subscriptions.retrieve(subscriptionData.stripe_subscription_id);
    const overageItem = subscription.items.data.find((item: any) => 
      item.price.metadata?.type === 'student_overage'
    );

    if (overageItem) {
      // Update existing overage quantity
      await stripe.subscriptionItems.update(overageItem.id, {
        quantity: extraStudents,
        proration_behavior: 'create_prorations',
      });
      logStep("Updated existing overage item", { itemId: overageItem.id, quantity: extraStudents });
    } else {
      // Create new overage line item
      await stripe.subscriptionItems.create({
        subscription: subscriptionData.stripe_subscription_id,
        price_data: {
          currency: 'brl',
          product_data: {
            name: 'Alunos Adicionais',
            description: 'Cobrança adicional por alunos acima do limite do plano',
          },
          unit_amount: 500, // R$ 5 per student
          recurring: { interval: 'month' },
          metadata: { type: 'student_overage' },
        },
        quantity: extraStudents,
        proration_behavior: 'create_prorations',
      });
      logStep("Created new overage item", { quantity: extraStudents });
    }

    // Update local subscription record
    const { error: updateError } = await supabaseClient
      .from('user_subscriptions')
      .update({
        extra_students: extraStudents,
        extra_cost_cents: extraCostCents,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (updateError) {
      logStep("Error updating subscription", { error: updateError });
      throw updateError;
    }

    logStep("Student overage billing completed", { 
      extraStudents, 
      extraCostCents,
      subscriptionId: subscriptionData.stripe_subscription_id 
    });

    return new Response(JSON.stringify({ 
      success: true,
      extraStudents,
      extraCostCents,
      message: `Cobrança adicional de R$ ${(extraCostCents / 100).toFixed(2)} configurada para ${extraStudents} aluno(s) extra`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in student overage handling", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
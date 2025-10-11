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

    // Get total number of students for this teacher
    const { count: totalStudents, error: countError } = await supabaseClient
      .from('teacher_student_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', user.id);

    if (countError) {
      logStep("Error counting students", { error: countError });
      throw new Error(`Failed to count students: ${countError.message}`);
    }

    logStep("Total students counted", { totalStudents });

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

    // Retrieve subscription to get payment method
    const subscription = await stripe.subscriptions.retrieve(subscriptionData.stripe_subscription_id);
    
    let immediateChargeSuccess = false;
    let immediateChargeError = null;

    // Try to create immediate charge if payment method exists
    if (subscription.default_payment_method) {
      try {
        logStep("Creating immediate charge", { amount: 500, customerId: subscriptionData.stripe_customer_id });
        
        const immediateCharge = await stripe.paymentIntents.create({
          amount: 500, // R$ 5.00 em centavos
          currency: 'brl',
          customer: subscriptionData.stripe_customer_id,
          description: 'Cobrança imediata - Aluno adicional',
          payment_method: subscription.default_payment_method as string,
          off_session: true,
          confirm: true,
          metadata: {
            type: 'student_overage_immediate',
            user_id: user.id,
            extra_students: extraStudents.toString(),
          }
        });

        logStep("Immediate charge created", { 
          paymentIntentId: immediateCharge.id,
          status: immediateCharge.status 
        });

        // Check if payment succeeded
        if (immediateCharge.status !== 'succeeded') {
          throw new Error(`Payment failed with status: ${immediateCharge.status}`);
        }

        // Register immediate charge in database
        const { error: insertError } = await supabaseClient
          .from('student_overage_charges')
          .insert({
            user_id: user.id,
            stripe_payment_intent_id: immediateCharge.id,
            amount_cents: 500,
            status: immediateCharge.status,
            extra_students: extraStudents,
          });

        if (insertError) {
          logStep("Error inserting charge record", { error: insertError });
        }

        immediateChargeSuccess = true;
      } catch (immediateChargeError: any) {
        logStep("Immediate charge failed - CRITICAL ERROR", { 
          error: immediateChargeError.message 
        });
        
        // CRITICAL: If immediate charge fails, we must return error to block student creation
        return new Response(JSON.stringify({ 
          success: false,
          error: `Falha ao processar pagamento: ${immediateChargeError.message}`,
          payment_failed: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }
    } else {
      logStep("No default payment method - BLOCKING student creation");
      
      // CRITICAL: No payment method = cannot charge = block student creation
      return new Response(JSON.stringify({ 
        success: false,
        error: "Nenhum método de pagamento configurado. Configure um cartão antes de adicionar alunos extras.",
        payment_failed: true
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Update the main subscription item quantity with total students
    // The tiered pricing will automatically calculate the correct charge
    const mainItem = subscription.items.data[0]; // Main subscription item with tiered pricing
    
    if (!mainItem) {
      logStep("ERROR: No main subscription item found");
      throw new Error("No main subscription item found");
    }

    await stripe.subscriptionItems.update(mainItem.id, {
      quantity: totalStudents, // Update with total students, not just extra
      proration_behavior: 'none', // No proration since we already charged immediately
    });
    
    logStep("Updated main subscription item", { 
      itemId: mainItem.id, 
      oldQuantity: mainItem.quantity,
      newQuantity: totalStudents,
      extraStudents 
    });

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

    logStep("Student overage billing completed successfully", { 
      extraStudents, 
      extraCostCents,
      subscriptionId: subscriptionData.stripe_subscription_id,
      immediateChargeSuccess: true
    });

    return new Response(JSON.stringify({ 
      success: true,
      extraStudents,
      extraCostCents,
      immediateChargeSuccess: true,
      message: `Cobrança imediata de R$ 5,00 realizada com sucesso. A partir do próximo mês, será cobrado R$ ${(extraCostCents / 100).toFixed(2)}/mês.`
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
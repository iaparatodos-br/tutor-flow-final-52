/**
 * INTERNAL FUNCTION - Called only by create-student edge function
 * 
 * This function handles billing for student overage when a teacher
 * exceeds their plan's student limit. It processes an immediate R$ 5.00
 * charge and updates the subscription quantity.
 * 
 * Security: This function should ONLY be called by other edge functions
 * using service_role key. It does not authenticate end users directly.
 * The userId must be provided in the request body.
 */

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

    const { extraStudents, planLimit, userId } = await req.json();

    // Guard clause: validate all required inputs
    if (!userId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "userId é obrigatório" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (extraStudents == null || typeof extraStudents !== 'number' || extraStudents <= 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Parâmetro extraStudents inválido: ${extraStudents}` 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (planLimit == null || typeof planLimit !== 'number') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Parâmetro planLimit inválido: ${planLimit}` 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Processing student overage for user", { userId, extraStudents, planLimit });

    // Calculate extra cost (R$ 5 per additional student)
    const extraCostCents = extraStudents * 500; // R$ 5.00 = 500 cents

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Get total number of students AND dependents for this teacher (for plan limits)
    const { data: countData, error: countError } = await supabaseClient
      .rpc('count_teacher_students_and_dependents', { p_teacher_id: userId });

    if (countError) {
      logStep("Error counting students and dependents", { error: countError });
      throw new Error(`Failed to count students: ${countError.message}`);
    }

    const totalStudents = countData?.[0]?.total_students ?? 0;
    logStep("Total students + dependents counted", { 
      totalStudents,
      regularStudents: countData?.[0]?.regular_students,
      dependentsCount: countData?.[0]?.dependents_count
    });

    // Get current subscription
    const { data: subscriptionData, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select('stripe_subscription_id, stripe_customer_id, plan_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

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
            user_id: userId,
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

        // FIX #396: student_overage_charges table does not exist
        // Log the charge details instead of inserting into non-existent table
        // The charge is already tracked in Stripe via payment intent metadata
        logStep("Immediate charge recorded in Stripe", {
          paymentIntentId: immediateCharge.id,
          amount_cents: 500,
          status: immediateCharge.status,
          extra_students: extraStudents,
          user_id: userId
        });

        // Write audit log for tracking
        await supabaseClient.from('audit_logs').insert({
          actor_id: userId,
          target_teacher_id: userId,
          table_name: 'student_overage',
          record_id: immediateCharge.id,
          operation: 'STUDENT_OVERAGE_CHARGE',
          old_data: null,
          new_data: {
            stripe_payment_intent_id: immediateCharge.id,
            amount_cents: 500,
            extra_students: extraStudents,
            status: immediateCharge.status
          }
        });

        immediateChargeSuccess = true;
      } catch (chargeError: any) {
      logStep("Immediate charge failed - CRITICAL ERROR", { 
          error: chargeError.message 
        });
        
        // Return 200 with success:false so create-student can read the error body
        return new Response(JSON.stringify({ 
          success: false,
          error: `Falha ao processar pagamento: ${chargeError.message}`,
          payment_failed: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    } else {
      logStep("No default payment method - BLOCKING student creation");
      
      // Return 200 with success:false so create-student can read the error body
      return new Response(JSON.stringify({ 
        success: false,
        error: "Nenhum método de pagamento configurado. Configure um cartão antes de adicionar alunos extras.",
        payment_failed: true
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Update the main subscription item quantity with total students
    const mainItem = subscription.items.data[0];
    
    if (!mainItem) {
      logStep("ERROR: No main subscription item found");
      throw new Error("No main subscription item found");
    }

    await stripe.subscriptionItems.update(mainItem.id, {
      quantity: totalStudents,
      proration_behavior: 'none',
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
      .eq('user_id', userId)
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

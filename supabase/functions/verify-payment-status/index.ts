import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-PAYMENT-STATUS] ${step}${detailsStr}`);
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

    // AUTH: Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header provided" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const authUserId = userData.user.id;
    logStep("User authenticated", { userId: authUserId });

    const { invoice_id } = await req.json();
    if (!invoice_id) throw new Error("invoice_id is required");

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .maybeSingle();

    if (invoiceError || !invoice) {
      throw new Error("Invoice not found");
    }

    // AUTH: Verify user is the student or teacher of this invoice
    if (invoice.student_id !== authUserId && invoice.teacher_id !== authUserId) {
      logStep("AUTHORIZATION FAILED", { authUserId, studentId: invoice.student_id, teacherId: invoice.teacher_id });
      return new Response(JSON.stringify({ error: "Você não tem permissão para verificar esta fatura" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    logStep("Invoice found", { invoiceId: invoice_id, status: invoice.status });

    // Guard: If already in terminal status, return current status
    const terminalStatuses = ['paga', 'cancelada'];
    if (terminalStatuses.includes(invoice.status)) {
      return new Response(JSON.stringify({
        status: invoice.status,
        message: `Invoice is already in terminal status: ${invoice.status}`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Guard: don't overwrite manual payments
    if (invoice.payment_origin === 'manual') {
      return new Response(JSON.stringify({
        status: invoice.status,
        message: 'Invoice was manually confirmed, skipping automatic verification'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // If no payment intent ID, can't verify
    if (!invoice.stripe_payment_intent_id) {
      return new Response(JSON.stringify({
        status: invoice.status,
        message: 'No payment intent found for this invoice'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Check payment intent status in Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
    
    logStep("Payment intent retrieved", { 
      paymentIntentId: paymentIntent.id, 
      status: paymentIntent.status 
    });

    let newStatus = invoice.status;
    
    if (paymentIntent.status === 'succeeded') {
      newStatus = 'paga';
    } else if (paymentIntent.status === 'canceled' || paymentIntent.status === 'payment_failed') {
      newStatus = 'falha_pagamento';
    }

    // Update invoice status if it changed (with guard clause)
    if (newStatus !== invoice.status) {
      const { error: updateError } = await supabaseClient
        .from("invoices")
        .update({ status: newStatus })
        .eq("id", invoice_id)
        .in("status", ["pendente", "falha_pagamento"]); // Guard: only update non-terminal

      if (updateError) {
        logStep("Error updating invoice status", updateError);
        throw new Error(`Database error: ${updateError.message}`);
      }

      logStep("Invoice status updated", { 
        invoiceId: invoice_id, 
        oldStatus: invoice.status, 
        newStatus 
      });
    }

    return new Response(JSON.stringify({
      status: newStatus,
      payment_intent_status: paymentIntent.status,
      updated: newStatus !== invoice.status
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in verify-payment-status", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
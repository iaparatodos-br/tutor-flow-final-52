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
    
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    const supabaseUserClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader || "" } }, auth: { persistSession: false } }
    );

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
    if (userError || !user) {
      logStep("User not authenticated", { error: userError?.message });
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    logStep("User authenticated", { userId: user.id });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { invoice_id } = await req.json();
    if (!invoice_id) throw new Error("invoice_id is required");

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("Invoice not found");
    }

    // Validate user has access to this invoice
    const isStudent = user.id === invoice.student_id;
    const isTeacher = user.id === invoice.teacher_id;

    if (!isStudent && !isTeacher) {
      logStep("Access denied", { userId: user.id, invoiceStudentId: invoice.student_id, invoiceTeacherId: invoice.teacher_id });
      return new Response(JSON.stringify({ error: "Sem permissão para verificar esta fatura" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    logStep("Invoice found", { invoiceId: invoice_id, status: invoice.status, accessedBy: isStudent ? 'student' : 'teacher' });

    // If already paid, return current status
    if (invoice.status === 'paga') {
      return new Response(JSON.stringify({
        status: 'paga',
        message: 'Invoice is already paid'
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
    } else if (paymentIntent.status === 'canceled') {
      // PIX/Boleto expired - clear payment data and allow new generation
      logStep("Payment intent canceled (expired)", { paymentIntentId: paymentIntent.id });
      
      const { error: clearError } = await supabaseClient
        .from("invoices")
        .update({ 
          stripe_payment_intent_id: null,
          pix_qr_code: null,
          pix_copy_paste: null,
          boleto_url: null,
          linha_digitavel: null,
          barcode: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", invoice_id);
      
      if (clearError) {
        logStep("Error clearing expired payment data", clearError);
      }
      
      return new Response(JSON.stringify({
        status: invoice.status,
        payment_expired: true,
        message: 'O código de pagamento expirou. Gere um novo.'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else if (paymentIntent.status === 'payment_failed') {
      newStatus = 'falha_pagamento';
    }

    // Update invoice status if it changed
    if (newStatus !== invoice.status) {
      const { error: updateError } = await supabaseClient
        .from("invoices")
        .update({ status: newStatus })
        .eq("id", invoice_id);

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
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[AUTO-VERIFY-INVOICES] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Starting automatic invoice verification");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Buscar todas as faturas pendentes com payment_intent_id
    const { data: pendingInvoices, error: fetchError } = await supabaseClient
      .from("invoices")
      .select("*")
      .in("status", ["pendente", "falha_pagamento"])
      .not("stripe_payment_intent_id", "is", null)
      .limit(50); // Limitar para evitar timeout

    if (fetchError) {
      logStep("Error fetching pending invoices", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (!pendingInvoices || pendingInvoices.length === 0) {
      logStep("No pending invoices to verify");
      return new Response(JSON.stringify({
        message: "No pending invoices to verify",
        verified: 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Found pending invoices", { count: pendingInvoices.length });

    let verifiedCount = 0;
    let updatedCount = 0;
    const results = [];

    // Verificar cada fatura
    for (const invoice of pendingInvoices) {
      try {
        logStep("Verifying invoice", { 
          invoiceId: invoice.id, 
          paymentIntentId: invoice.stripe_payment_intent_id 
        });

        // Buscar status do payment intent no Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(
          invoice.stripe_payment_intent_id
        );

        verifiedCount++;

        let newStatus = invoice.status;
        
        if (paymentIntent.status === 'succeeded') {
          newStatus = 'paga';
        } else if (paymentIntent.status === 'canceled' || paymentIntent.status === 'payment_failed') {
          newStatus = 'falha_pagamento';
        }

        // Atualizar se o status mudou
        if (newStatus !== invoice.status) {
          const { error: updateError } = await supabaseClient
            .from("invoices")
            .update({ 
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq("id", invoice.id);

          if (updateError) {
            logStep("Error updating invoice", { 
              invoiceId: invoice.id, 
              error: updateError 
            });
          } else {
            updatedCount++;
            logStep("Invoice status updated", { 
              invoiceId: invoice.id, 
              oldStatus: invoice.status, 
              newStatus 
            });
          }
        }

        results.push({
          invoice_id: invoice.id,
          payment_intent_id: invoice.stripe_payment_intent_id,
          old_status: invoice.status,
          new_status: newStatus,
          updated: newStatus !== invoice.status
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logStep("Error verifying invoice", { 
          invoiceId: invoice.id, 
          error: errorMessage 
        });
        
        results.push({
          invoice_id: invoice.id,
          error: errorMessage
        });
      }
    }

    logStep("Verification complete", { 
      total: pendingInvoices.length,
      verified: verifiedCount,
      updated: updatedCount 
    });

    return new Response(JSON.stringify({
      message: "Invoice verification complete",
      total_invoices: pendingInvoices.length,
      verified: verifiedCount,
      updated: updatedCount,
      results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in auto-verify-invoices", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[WEBHOOK-STRIPE-CONNECT] ${step}${detailsStr}`);
};

serve(async (req) => {
  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_CONNECT");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!endpointSecret) throw new Error("STRIPE_WEBHOOK_SECRET_CONNECT is not set");

    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new Error("No stripe signature header");

    const body = await req.text();
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
      logStep("Webhook signature verified successfully", { type: event.type, id: event.id });
    } catch (err) {
      logStep("Webhook signature verification failed", { error: err.message });
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    logStep("Webhook verified", { type: event.type, id: event.id });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Handle different event types
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        logStep("Payment succeeded", { paymentIntentId: paymentIntent.id });

        if (paymentIntent.metadata?.invoice_id) {
          const { error } = await supabaseClient
            .from("invoices")
            .update({
              status: "paga",
              payment_method: paymentIntent.payment_method_types[0],
              updated_at: new Date().toISOString()
            })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          if (error) {
            logStep("Error updating invoice status", error);
          } else {
            logStep("Invoice marked as paid", { invoiceId: paymentIntent.metadata.invoice_id });
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        logStep("Payment failed", { paymentIntentId: paymentIntent.id });

        if (paymentIntent.metadata?.invoice_id) {
          const { error } = await supabaseClient
            .from("invoices")
            .update({
              status: "falha_pagamento",
              updated_at: new Date().toISOString()
            })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          if (error) {
            logStep("Error updating invoice status", error);
          } else {
            logStep("Invoice marked as payment failed", { invoiceId: paymentIntent.metadata.invoice_id });
          }
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        logStep("Account updated", { accountId: account.id });

        const { error } = await supabaseClient
          .from("stripe_connect_accounts")
          .update({
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
            details_submitted: account.details_submitted,
            requirements: account.requirements,
            capabilities: account.capabilities,
            updated_at: new Date().toISOString()
          })
          .eq("stripe_account_id", account.id);

        if (error) {
          logStep("Error updating connect account", error);
        } else {
          logStep("Connect account updated", { accountId: account.id });
        }

        // Also update payment_accounts table if linked
        const { error: paymentAccountError } = await supabaseClient
          .from("payment_accounts")
          .update({
            stripe_charges_enabled: account.charges_enabled,
            stripe_payouts_enabled: account.payouts_enabled,
            stripe_details_submitted: account.details_submitted,
            stripe_onboarding_status: account.details_submitted ? "completed" : "pending",
            updated_at: new Date().toISOString()
          })
          .eq("stripe_connect_account_id", account.id);

        if (paymentAccountError) {
          logStep("Error updating payment account", paymentAccountError);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Invoice payment succeeded", { invoiceId: invoice.id });
        
        // Handle Stripe invoice payments if using invoices instead of payment intents
        if (invoice.metadata?.invoice_id) {
          const { error } = await supabaseClient
            .from("invoices")
            .update({
              status: "paga",
              payment_method: "stripe_invoice",
              updated_at: new Date().toISOString()
            })
            .eq("stripe_invoice_id", invoice.id);

          if (error) {
            logStep("Error updating invoice from Stripe invoice", error);
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in webhook-stripe-connect", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.24.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[WEBHOOK-STRIPE-CONNECT] ${step}${detailsStr}`);
};

// Função para verificar e processar idempotência de eventos com rollback automático
const processEventIdempotency = async (
  supabase: any,
  event: Stripe.Event,
  webhookFunction: string
): Promise<{ canProcess: boolean; result?: any }> => {
  try {
    const { data, error } = await supabase.rpc('start_stripe_event_processing', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_webhook_function: webhookFunction,
      p_event_created: new Date(event.created * 1000).toISOString(),
      p_event_data: event
    });

    if (error) {
      logStep("Error in idempotency check", { error, eventId: event.id });
      throw error;
    }

    const action = data?.action;
    logStep("Idempotency check result", { eventId: event.id, action, message: data?.message });

    if (['skipped', 'rejected', 'max_retries'].includes(action)) {
      return { 
        canProcess: false, 
        result: { received: true, skipped: true, message: data?.message, action } 
      };
    }

    return { canProcess: true };
  } catch (error) {
    logStep("Failed idempotency check", { error: (error as Error).message, eventId: event.id });
    throw error;
  }
};

// Função para marcar evento como processado ou com falha
const completeEventProcessing = async (
  supabase: any,
  eventId: string,
  success: boolean = true,
  error?: Error
): Promise<void> => {
  try {
    const { error: completeError } = await supabase.rpc('complete_stripe_event_processing', {
      p_event_id: eventId,
      p_success: success,
      p_error_message: error?.message || null
    });

    if (completeError) {
      logStep("Error completing event processing", { error: completeError, eventId });
    } else {
      logStep("Event processing completed", { eventId, success });
    }
  } catch (err) {
    logStep("Failed to complete event processing", { error: (err as Error).message, eventId });
  }
};

// Validação de integridade dos dados do evento
const validateStripeEvent = (event: Stripe.Event): boolean => {
  if (!event.id || !event.type || !event.created || !event.data?.object) {
    return false;
  }

  // Validar estrutura básica baseada no tipo de evento
  const eventObject = event.data.object as any;
  
  switch (event.type) {
    case 'account.updated':
      return !!(eventObject.id && eventObject.type);
      
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed':
    case 'invoice.marked_uncollectible':
    case 'invoice.voided':
      return !!(eventObject.id && eventObject.customer);
      
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
      return !!(eventObject.id && eventObject.status);
      
    default:
      return true; // Permitir eventos desconhecidos por compatibilidade
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_CONNECT");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!endpointSecret) throw new Error("STRIPE_WEBHOOK_SECRET_CONNECT is not set");

    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new Error("No stripe signature header");

    const body = await req.text();
    const stripe = new Stripe(stripeKey, { 
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
      logStep("Webhook signature verified successfully", { type: event.type, id: event.id });
    } catch (err) {
      logStep("Webhook signature verification failed", { error: err.message });
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const eventObject = event.data.object as any;
    logStep("Processing event", { type: event.type, id: event.id });

    // Validar integridade dos dados do evento
    if (!validateStripeEvent(event)) {
      logStep("Invalid event structure", { eventId: event.id, type: event.type });
      return new Response(JSON.stringify({ 
        error: "Invalid event structure",
        eventId: event.id,
        type: event.type 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verificar idempotência antes de processar o evento
    const { canProcess, result } = await processEventIdempotency(
      supabaseClient,
      event,
      'webhook-stripe-connect'
    );

    if (!canProcess) {
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Handle different event types with focus on invoicing
    switch (event.type) {
      case 'account.updated': {
        // Manter a lógica existente para onboarding do Connect
        const account = eventObject as Stripe.Account;
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

      case 'invoice.paid': {
        // NOVO: A fatura foi paga com sucesso
        const paidInvoice = eventObject as Stripe.Invoice;
        logStep("Invoice paid", { invoiceId: paidInvoice.id });

        const { error: paidError } = await supabaseClient
          .from('invoices')
          .update({ 
            status: 'paga',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_invoice_id', paidInvoice.id);

        if (paidError) {
          logStep("Error updating invoice status to paid", paidError);
          return new Response(JSON.stringify({ error: 'Failed to update invoice to paid' }), { 
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        logStep("Invoice marked as paid", { invoiceId: paidInvoice.id });
        break;
      }

      case 'invoice.payment_succeeded': {
        // NOVO: Pagamento da fatura foi bem-sucedido
        const succeededInvoice = eventObject as Stripe.Invoice;
        logStep("Invoice payment succeeded", { invoiceId: succeededInvoice.id });

        const { error: succeededError } = await supabaseClient
          .from('invoices')
          .update({ 
            status: 'paga',
            payment_method: 'stripe_invoice',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_invoice_id', succeededInvoice.id);

        if (succeededError) {
          logStep("Error updating invoice payment succeeded", succeededError);
        } else {
          logStep("Invoice payment succeeded processed", { invoiceId: succeededInvoice.id });
        }
        break;
      }

      case 'invoice.payment_failed': {
        // NOVO: A tentativa de pagamento falhou
        const failedInvoice = eventObject as Stripe.Invoice;
        logStep("Invoice payment failed", { 
          invoiceId: failedInvoice.id, 
          reason: failedInvoice.last_payment_error?.message 
        });

        const { error: failedError } = await supabaseClient
          .from('invoices')
          .update({ 
            status: 'falha_pagamento',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_invoice_id', failedInvoice.id);

        if (failedError) {
          logStep("Error updating invoice payment failed", failedError);
        } else {
          logStep("Invoice marked as payment failed", { invoiceId: failedInvoice.id });
        }
        break;
      }
      
      case 'invoice.marked_uncollectible': {
        // NOVO: O Stripe marcou a fatura como incobrável (gatilho de inadimplência)
        const uncollectibleInvoice = eventObject as Stripe.Invoice;
        logStep("Invoice marked uncollectible", { invoiceId: uncollectibleInvoice.id });

        const { error: overdueError } = await supabaseClient
          .from('invoices')
          .update({ 
            status: 'overdue',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_invoice_id', uncollectibleInvoice.id);

        if (overdueError) {
          logStep("Error updating invoice status to overdue", overdueError);
          return new Response(JSON.stringify({ error: 'Failed to update invoice to overdue' }), { 
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        logStep("Invoice marked as overdue", { invoiceId: uncollectibleInvoice.id });
        break;
      }

      case 'invoice.voided': {
        // NOVO: Fatura foi cancelada/anulada
        const voidedInvoice = eventObject as Stripe.Invoice;
        logStep("Invoice voided", { invoiceId: voidedInvoice.id });

        const { error: voidError } = await supabaseClient
          .from('invoices')
          .update({ 
            status: 'cancelada',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_invoice_id', voidedInvoice.id);

        if (voidError) {
          logStep("Error updating invoice status to voided", voidError);
        } else {
          logStep("Invoice marked as voided", { invoiceId: voidedInvoice.id });
        }
        break;
      }

      case "payment_intent.succeeded": {
        // Manter compatibilidade com payment intents existentes
        const paymentIntent = eventObject as Stripe.PaymentIntent;
        logStep("Payment intent succeeded", { paymentIntentId: paymentIntent.id });

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
            logStep("Error updating invoice from payment intent", error);
          } else {
            logStep("Invoice updated from payment intent", { invoiceId: paymentIntent.metadata.invoice_id });
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        // Manter compatibilidade com payment intents existentes
        const paymentIntent = eventObject as Stripe.PaymentIntent;
        logStep("Payment intent failed", { paymentIntentId: paymentIntent.id });

        if (paymentIntent.metadata?.invoice_id) {
          const { error } = await supabaseClient
            .from("invoices")
            .update({
              status: "falha_pagamento",
              updated_at: new Date().toISOString()
            })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          if (error) {
            logStep("Error updating invoice payment intent failed", error);
          } else {
            logStep("Invoice marked as failed from payment intent", { invoiceId: paymentIntent.metadata.invoice_id });
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    // Marcar evento como processado com sucesso
    await completeEventProcessing(supabaseClient, event.id, true);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in webhook-stripe-connect", { message: errorMessage });
    
    // Marcar evento como falhou (se event existe)
    if (event?.id) {
      await completeEventProcessing(supabaseClient, event.id, false, error as Error);
    }
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
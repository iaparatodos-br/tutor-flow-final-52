import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const log = (step: string, details?: any) => {
  const d = details ? ` | ${JSON.stringify(details)}` : "";
  console.log(`[WEBHOOK-STRIPE-SUBSCRIPTIONS] ${step}${d}`);
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
      log("Error in idempotency check", { error, eventId: event.id });
      throw error;
    }

    const action = data?.action;
    log("Idempotency check result", { eventId: event.id, action, message: data?.message });

    if (['skipped', 'rejected', 'max_retries'].includes(action)) {
      return { 
        canProcess: false, 
        result: { received: true, skipped: true, message: data?.message, action } 
      };
    }

    return { canProcess: true };
  } catch (error) {
    log("Failed idempotency check", { error: (error as Error).message, eventId: event.id });
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
      log("Error completing event processing", { error: completeError, eventId });
    } else {
      log("Event processing completed", { eventId, success });
    }
  } catch (err) {
    log("Failed to complete event processing", { error: (err as Error).message, eventId });
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
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return !!(eventObject.id && eventObject.customer && eventObject.status);
      
    case 'checkout.session.completed':
      return !!(eventObject.id && eventObject.customer);
      
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed':
      return !!(eventObject.id && eventObject.customer);
      
    default:
      return true; // Permitir eventos desconhecidos por compatibilidade
  }
};

// Map Stripe subscription status to local status
// paymentMethod parameter is used to handle boleto pending state
const mapStripeStatus = (status: string, paymentMethod?: string | null): string => {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "incomplete":
      // If payment method is boleto, use specific pending status
      if (paymentMethod === 'boleto') {
        return "pending_boleto";
      }
      return "past_due";
    case "incomplete_expired":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return status || "active";
  }
};

// Helper to detect payment method from latest invoice
const getPaymentMethodFromSubscription = async (stripe: any, subscriptionId: string): Promise<string | null> => {
  try {
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 1
    });

    if (invoices.data.length > 0) {
      const invoice = invoices.data[0];
      if (invoice.payment_intent) {
        const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent as string);
        const pmTypes = paymentIntent.payment_method_types || [];
        
        if (pmTypes.includes('boleto')) return 'boleto';
        if (pmTypes.includes('pix')) return 'pix';
        
        // Also check next_action for boleto
        if (paymentIntent.next_action?.type === 'boleto_display_details') {
          return 'boleto';
        }
      }
    }
    return null;
  } catch (error) {
    log("Error getting payment method from subscription", { error: (error as Error).message, subscriptionId });
    return null;
  }
};

// Helper to get boleto details from payment intent
const getBoletoDetailsFromSubscription = async (stripe: any, subscriptionId: string): Promise<{
  url: string | null;
  dueDate: string | null;
  barcode: string | null;
}> => {
  try {
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 1
    });

    if (invoices.data.length > 0 && invoices.data[0].payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(invoices.data[0].payment_intent as string);
      const boletoDetails = pi.next_action?.boleto_display_details;
      
      if (boletoDetails) {
        return {
          url: boletoDetails.hosted_voucher_url || null,
          dueDate: boletoDetails.expires_at ? new Date(boletoDetails.expires_at * 1000).toISOString() : null,
          barcode: boletoDetails.number || null
        };
      }
    }
    return { url: null, dueDate: null, barcode: null };
  } catch (error) {
    log("Error getting boleto details", { error: (error as Error).message, subscriptionId });
    return { url: null, dueDate: null, barcode: null };
  }
};

serve(async (req) => {
  // Webhooks don't need CORS, but we still handle OPTIONS safely
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_SUBSCRIPTIONS");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeSecret || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    log("Missing environment variables", { 
      stripeSecret: !!stripeSecret,
      webhookSecret: !!webhookSecret,
      supabaseUrl: !!supabaseUrl,
      supabaseServiceKey: !!supabaseServiceKey
    });
    return new Response(JSON.stringify({ error: "Missing environment variables" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2023-10-16" });
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  const signature = req.headers.get("Stripe-Signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature!, webhookSecret);
    log("Event verified", { type: event.type, id: event.id });
  } catch (err) {
    log("Signature verification failed", { error: (err as Error).message });
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  // Helpers
  const findUserByCustomer = async (customerId: string): Promise<{ userId: string | null; email: string | null }> => {
    // 1) Try profiles by stripe_customer_id
    const { data: byCustomer } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (byCustomer?.id) return { userId: byCustomer.id, email: byCustomer.email };

    // 2) Retrieve customer email from Stripe, match profiles by email
    try {
      const customer = (await stripe.customers.retrieve(customerId)) as any;
      const email = customer?.email as string | undefined;
      if (email) {
        const { data: byEmail } = await supabase
          .from("profiles")
          .select("id, email")
          .eq("email", email)
          .maybeSingle();
        if (byEmail?.id) return { userId: byEmail.id, email: byEmail.email };
        return { userId: null, email: email };
      }
    } catch (e) {
      log("Failed to retrieve Stripe customer", { error: (e as Error).message, customerId });
    }
    return { userId: null, email: null };
  };

  const getPlanIdByPriceId = async (priceId: string | null): Promise<string | null> => {
    if (!priceId) return null;
    const { data } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("stripe_price_id", priceId)
      .eq("is_active", true)
      .maybeSingle();
    return data?.id ?? null;
  };

  const upsertUserSubscription = async (params: {
    userId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    priceId: string | null;
    status: string;
    currentPeriodStart: number | null;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean | null;
    paymentMethod?: string | null;
    boletoDetails?: { url: string | null; dueDate: string | null; barcode: string | null };
  }) => {
    const planId = await getPlanIdByPriceId(params.priceId);
    const mappedStatus = mapStripeStatus(params.status, params.paymentMethod);

    // Check if a row exists for this user
    const { data: existing } = await supabase
      .from("user_subscriptions")
      .select("id")
      .eq("user_id", params.userId)
      .limit(1);

    const payload: any = {
      user_id: params.userId,
      plan_id: planId,
      stripe_customer_id: params.stripeCustomerId,
      stripe_subscription_id: params.stripeSubscriptionId,
      status: mappedStatus,
      current_period_start: params.currentPeriodStart ? new Date(params.currentPeriodStart * 1000).toISOString() : null,
      current_period_end: params.currentPeriodEnd ? new Date(params.currentPeriodEnd * 1000).toISOString() : null,
      cancel_at_period_end: params.cancelAtPeriodEnd ?? false,
    };

    // Add boleto-specific fields if pending_boleto
    if (mappedStatus === 'pending_boleto') {
      payload.pending_payment_method = 'boleto';
      if (params.boletoDetails) {
        payload.boleto_url = params.boletoDetails.url;
        payload.boleto_due_date = params.boletoDetails.dueDate;
        payload.boleto_barcode = params.boletoDetails.barcode;
      }
    } else if (mappedStatus === 'active') {
      // Clear boleto fields when subscription becomes active
      payload.pending_payment_method = null;
      payload.boleto_url = null;
      payload.boleto_due_date = null;
      payload.boleto_barcode = null;
    }

    if (existing && existing.length > 0) {
      const id = existing[0].id;
      await supabase.from("user_subscriptions").update(payload).eq("id", id);
    } else {
      await supabase.from("user_subscriptions").insert(payload);
    }

    // Keep profiles in sync (best-effort)
    const profileUpdate: any = {
      stripe_customer_id: params.stripeCustomerId,
      current_plan_id: planId,
      subscription_status: mappedStatus,
      subscription_end_date: params.currentPeriodEnd ? new Date(params.currentPeriodEnd * 1000).toISOString() : null,
    };
    await supabase.from("profiles").update(profileUpdate).eq("id", params.userId);

    // Send boleto notification email if pending_boleto
    if (mappedStatus === 'pending_boleto' && params.boletoDetails?.url) {
      try {
        // Get plan name for email
        let planName = "Premium";
        if (planId) {
          const { data: plan } = await supabase
            .from("subscription_plans")
            .select("name")
            .eq("id", planId)
            .single();
          if (plan) planName = plan.name;
        }

        // Get latest invoice amount
        let amount = 0;
        if (params.stripeSubscriptionId) {
          const invoices = await stripe.invoices.list({
            subscription: params.stripeSubscriptionId,
            limit: 1
          });
          if (invoices.data.length > 0) {
            amount = invoices.data[0].amount_due;
          }
        }

        await supabase.functions.invoke("send-boleto-subscription-notification", {
          body: {
            user_id: params.userId,
            notification_type: "boleto_generated",
            boleto_url: params.boletoDetails.url,
            due_date: params.boletoDetails.dueDate,
            amount: amount,
            barcode: params.boletoDetails.barcode,
            plan_name: planName
          }
        });
        log("Boleto notification sent", { userId: params.userId });
      } catch (notifError) {
        log("Error sending boleto notification", { error: (notifError as Error).message });
      }
    }
  };

  try {
    // Validar integridade dos dados do evento
    if (!validateStripeEvent(event)) {
      log("Invalid event structure", { eventId: event.id, type: event.type });
      return new Response(JSON.stringify({ 
        error: "Invalid event structure",
        eventId: event.id,
        type: event.type 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Verificar idempotência antes de processar o evento
    const { canProcess, result } = await processEventIdempotency(
      supabase,
      event,
      'webhook-stripe-subscriptions'
    );

    if (!canProcess) {
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        log("checkout.session.completed received", { id: session.id, mode: session.mode });
        if (session.mode !== "subscription") break;

        const customerId = (session.customer as string) ?? "";
        const subscriptionId = (session.subscription as string) ?? null;
        const { userId } = await findUserByCustomer(customerId);
        if (!userId) {
          log("CRITICAL: User not found for customer on checkout", { customerId, sessionId: session.id });
          await completeEventProcessing(supabase, event.id, false, new Error("User not found for customer"));
          return new Response(JSON.stringify({ 
            error: "User not found for customer",
            customerId,
            sessionId: session.id
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          });
        }

        // Extract student_count from metadata
        const studentCountStr = session.metadata?.student_count;
        const totalStudents = studentCountStr ? parseInt(studentCountStr, 10) : 0;
        
        log("Checkout with student count", { totalStudents, metadata: session.metadata });

        let priceId: string | null = null;
        let extraStudents = 0;
        let extraCostCents = 0;
        
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          priceId = sub.items.data[0]?.price?.id ?? null;
          
          // Get plan to calculate extras
          const planId = await getPlanIdByPriceId(priceId);
          if (planId) {
            const { data: planData } = await supabase
              .from('subscription_plans')
              .select('student_limit')
              .eq('id', planId)
              .single();
            
            if (planData && totalStudents > 0) {
              extraStudents = Math.max(0, totalStudents - (planData.student_limit || 0));
              extraCostCents = extraStudents * 500;
              log("Calculated overage from checkout", { 
                totalStudents, 
                planLimit: planData.student_limit, 
                extraStudents,
                extraCostCents 
              });
            }
          }
          
          // Check if payment method is boleto
          const paymentMethod = await getPaymentMethodFromSubscription(stripe, subscriptionId);
          const boletoDetails = paymentMethod === 'boleto' 
            ? await getBoletoDetailsFromSubscription(stripe, subscriptionId) 
            : undefined;
          
          log("Payment method detected on checkout", { paymentMethod, hasBoletoDetails: !!boletoDetails?.url });
          
          await upsertUserSubscription({
            userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            priceId,
            status: sub.status,
            currentPeriodStart: sub.current_period_start ?? null,
            currentPeriodEnd: sub.current_period_end ?? null,
            cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
            paymentMethod,
            boletoDetails,
          });
          
          // Update extra_students and extra_cost_cents separately if needed
          if (extraStudents > 0) {
            await supabase
              .from("user_subscriptions")
              .update({
                extra_students: extraStudents,
                extra_cost_cents: extraCostCents
              })
              .eq("user_id", userId);
            
            log("Updated subscription with overage info", { userId, extraStudents, extraCostCents });
          }
        }
        
        await completeEventProcessing(supabase, event.id, true);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = (sub.customer as string) ?? "";
        const { userId } = await findUserByCustomer(customerId);
        if (!userId) {
          log("CRITICAL: User not found for customer on subscription event", { customerId, subId: sub.id, eventType: event.type });
          await completeEventProcessing(supabase, event.id, false, new Error("User not found for customer"));
          return new Response(JSON.stringify({ 
            error: "User not found for customer",
            customerId,
            subscriptionId: sub.id,
            eventType: event.type
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          });
        }
        
        // Handle teacher subscription cancellation for updated/deleted subscriptions
        if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
          await handleSubscriptionStatusChange(supabase, sub, userId, getPlanIdByPriceId);
        }
        
        const priceId = sub.items.data[0]?.price?.id ?? null;
        
        // Check if payment method is boleto for incomplete status
        let paymentMethod: string | null = null;
        let boletoDetails: { url: string | null; dueDate: string | null; barcode: string | null } | undefined;
        
        if (sub.status === 'incomplete') {
          paymentMethod = await getPaymentMethodFromSubscription(stripe, sub.id);
          if (paymentMethod === 'boleto') {
            boletoDetails = await getBoletoDetailsFromSubscription(stripe, sub.id);
            log("Boleto detected on subscription event", { hasBoletoDetails: !!boletoDetails?.url });
          }
        }
        
        await upsertUserSubscription({
          userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          priceId,
          status: sub.status,
          currentPeriodStart: sub.current_period_start ?? null,
          currentPeriodEnd: sub.current_period_end ?? null,
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
          paymentMethod,
          boletoDetails,
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = (invoice.customer as string) ?? "";
        const { userId } = await findUserByCustomer(customerId);
        if (!userId) {
          log("CRITICAL: User not found for customer on invoice.payment_succeeded", { customerId, invoiceId: invoice.id });
          await completeEventProcessing(supabase, event.id, false, new Error("User not found for customer"));
          return new Response(JSON.stringify({ 
            error: "User not found for customer",
            customerId,
            invoiceId: invoice.id
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          });
        }

        // Retrieve subscription to sync period and status
        const subscriptionId = (invoice.subscription as string) ?? null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price?.id ?? null;
          await upsertUserSubscription({
            userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            priceId,
            status: sub.status,
            currentPeriodStart: sub.current_period_start ?? null,
            currentPeriodEnd: sub.current_period_end ?? null,
            cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = (invoice.customer as string) ?? "";
        const { userId } = await findUserByCustomer(customerId);
        if (!userId) {
          log("CRITICAL: User not found for customer on invoice.payment_failed", { customerId, invoiceId: invoice.id });
          await completeEventProcessing(supabase, event.id, false, new Error("User not found for customer"));
          return new Response(JSON.stringify({ 
            error: "User not found for customer",
            customerId,
            invoiceId: invoice.id
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          });
        }

        // Mark as past_due if subscription exists
        const subscriptionId = (invoice.subscription as string) ?? null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price?.id ?? null;
          
          // Check payment attempt count - if 4th attempt failed, Stripe will cancel the subscription
          const attemptCount = invoice.attempt_count || 0;
          log("Payment failure attempt count", { invoiceId: invoice.id, attemptCount, subscriptionId });
          
          // Update subscription status
          await upsertUserSubscription({
            userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            priceId,
            status: "past_due",
            currentPeriodStart: sub.current_period_start ?? null,
            currentPeriodEnd: sub.current_period_end ?? null,
            cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
          });
          
          // If final attempt failed, subscription will be canceled by Stripe automatically
          // The subscription.deleted webhook will handle the downgrade
          if (attemptCount >= 4) {
            log("Final payment attempt failed, subscription will be canceled by Stripe", { 
              subscriptionId, 
              userId, 
              attemptCount 
            });
          }
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as any;
        
        // Check if this is a student overage immediate charge
        if (paymentIntent.metadata?.type === 'student_overage_immediate') {
          log("Student overage immediate charge succeeded", {
            paymentIntentId: paymentIntent.id,
            userId: paymentIntent.metadata.user_id,
            extraStudents: paymentIntent.metadata.extra_students,
          });
          
          // Update charge status in database
          const { error: updateError } = await supabase
            .from('student_overage_charges')
            .update({ status: 'succeeded' })
            .eq('stripe_payment_intent_id', paymentIntent.id);
            
          if (updateError) {
            log("Error updating overage charge status", { error: updateError });
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as any;
        
        // Check if this is a student overage immediate charge
        if (paymentIntent.metadata?.type === 'student_overage_immediate') {
          log("Student overage immediate charge FAILED", {
            paymentIntentId: paymentIntent.id,
            userId: paymentIntent.metadata.user_id,
            errorMessage: paymentIntent.last_payment_error?.message,
          });
          
          // Update charge status in database
          const { error: updateError } = await supabase
            .from('student_overage_charges')
            .update({ status: 'failed' })
            .eq('stripe_payment_intent_id', paymentIntent.id);
            
          if (updateError) {
            log("Error updating overage charge status", { error: updateError });
          }
          
          // TODO: Implement notification to teacher about failed immediate charge
          // The recurring charge will still be added to the subscription
        }
        break;
      }

      default:
        log("Unhandled event type", { type: event.type });
        break;
    }

    // Marcar evento como processado com sucesso
    await completeEventProcessing(supabase, event.id, true);
    
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    log("Error processing event", { error: (error as Error).message, type: event?.type });
    
    // Marcar evento como falhou
    await completeEventProcessing(supabase, event.id, false, error as Error);
    
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

// Handle subscription status changes for teacher cancellation
async function handleSubscriptionStatusChange(supabase: any, subscription: Stripe.Subscription, userId: string, getPlanIdByPriceId: any) {
  try {
    log('Checking subscription status change', { 
      status: subscription.status, 
      customerId: subscription.customer,
      userId 
    });

    // Only process cancellation and downgrade for fully canceled subscriptions
    const canceledStatuses = ['canceled', 'incomplete_expired'];
    if (!canceledStatuses.includes(subscription.status)) {
      log('Subscription status is not canceled, no downgrade needed', { status: subscription.status });
      return;
    }

    // Check if user is a professor
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profile?.role !== 'professor') {
      log('User is not a professor, skipping teacher cancellation');
      return;
    }

    // Get previous plan features
    const priceId = subscription.items?.data?.[0]?.price?.id;
    if (!priceId) {
      log('No price ID found in subscription');
      return;
    }

    const previousPlan = await getPlanIdByPriceId(priceId);
    if (!previousPlan) {
      log('No plan found for price ID', { priceId });
      return;
    }

    const { data: planDetails } = await supabase
      .from('subscription_plans')
      .select('features')
      .eq('id', previousPlan)
      .single();

    const hadFinancialModule = planDetails?.features?.financial_module === true;
    
    if (!hadFinancialModule) {
      log('Previous plan did not have financial module, skipping cancellation');
      return;
    }

    log('Triggering teacher subscription cancellation', { 
      teacherId: userId, 
      reason: subscription.status 
    });

    // Call the teacher cancellation function
    const { error: cancellationError } = await supabase.functions.invoke(
      'handle-teacher-subscription-cancellation',
      {
        body: {
          teacher_id: userId,
          cancellation_reason: subscription.status,
          previous_plan_features: planDetails.features
        }
      }
    );

    if (cancellationError) {
      log('Error calling teacher cancellation function', { error: cancellationError });
    } else {
      log('Teacher cancellation function called successfully');
    }

  } catch (error) {
    log('Error in handleSubscriptionStatusChange', { error: (error as Error).message });
  }
}

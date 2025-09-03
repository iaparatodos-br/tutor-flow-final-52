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

// Map Stripe subscription status to local status
const mapStripeStatus = (status: string): string => {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return status || "active";
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
    log("Missing environment variables");
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
  }) => {
    const planId = await getPlanIdByPriceId(params.priceId);

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
      status: mapStripeStatus(params.status),
      current_period_start: params.currentPeriodStart ? new Date(params.currentPeriodStart * 1000).toISOString() : null,
      current_period_end: params.currentPeriodEnd ? new Date(params.currentPeriodEnd * 1000).toISOString() : null,
      cancel_at_period_end: params.cancelAtPeriodEnd ?? false,
    };

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
      subscription_status: mapStripeStatus(params.status),
      subscription_end_date: params.currentPeriodEnd ? new Date(params.currentPeriodEnd * 1000).toISOString() : null,
    };
    await supabase.from("profiles").update(profileUpdate).eq("id", params.userId);
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        log("checkout.session.completed received", { id: session.id, mode: session.mode });
        if (session.mode !== "subscription") break;

        const customerId = (session.customer as string) ?? "";
        const subscriptionId = (session.subscription as string) ?? null;
        const { userId } = await findUserByCustomer(customerId);
        if (!userId) {
          log("User not found for customer", { customerId });
          break;
        }

        let priceId: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          priceId = sub.items.data[0]?.price?.id ?? null;
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

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = (sub.customer as string) ?? "";
        const { userId } = await findUserByCustomer(customerId);
        if (!userId) {
          log("User not found for customer on subscription.*", { customerId, subId: sub.id });
          break;
        }
        const priceId = sub.items.data[0]?.price?.id ?? null;
        await upsertUserSubscription({
          userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          priceId,
          status: sub.status,
          currentPeriodStart: sub.current_period_start ?? null,
          currentPeriodEnd: sub.current_period_end ?? null,
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = (invoice.customer as string) ?? "";
        const { userId } = await findUserByCustomer(customerId);
        if (!userId) {
          log("User not found for customer on invoice.payment_succeeded", { customerId, invoiceId: invoice.id });
          break;
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
          log("User not found for customer on invoice.payment_failed", { customerId, invoiceId: invoice.id });
          break;
        }

        // Mark as past_due if subscription exists
        const subscriptionId = (invoice.subscription as string) ?? null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price?.id ?? null;
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
        }
        break;
      }

      default:
        log("Unhandled event type", { type: event.type });
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    log("Error processing event", { error: (error as Error).message, type: event?.type });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

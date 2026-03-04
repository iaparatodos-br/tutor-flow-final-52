import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  const d = details ? ` | ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-PENDING-BOLETOS] ${step}${d}`);
};

// Get "tomorrow" date string (YYYY-MM-DD) in a specific timezone
function getTomorrowInTimezone(timezone: string): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(tomorrow);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing required environment variables");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Get all subscriptions with pending_boleto status
    const { data: pendingBoletosRaw, error: fetchError } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("status", "pending_boleto")
      .eq("pending_payment_method", "boleto");

    // Enrich with plan names
    let pendingBoletos: any[] | null = null;
    if (!fetchError && pendingBoletosRaw && pendingBoletosRaw.length > 0) {
      const planIds = [...new Set(pendingBoletosRaw.map(s => s.plan_id).filter(Boolean))];
      const { data: plans } = await supabase
        .from("subscription_plans")
        .select("id, name")
        .in("id", planIds);
      const planMap = new Map((plans || []).map(p => [p.id, p]));
      pendingBoletos = pendingBoletosRaw.map(s => ({
        ...s,
        subscription_plans: planMap.get(s.plan_id) || null,
      }));
    } else {
      pendingBoletos = pendingBoletosRaw;
    }

    if (fetchError) {
      throw fetchError;
    }

    log("Found pending boletos", { count: pendingBoletos?.length || 0 });

    // Fetch user timezones in batch
    const userIds = [...new Set((pendingBoletos || []).map(s => s.user_id))];
    const { data: userProfiles } = await supabase
      .from("profiles")
      .select("id, timezone")
      .in("id", userIds);
    const tzMap = new Map((userProfiles || []).map(p => [p.id, p.timezone || 'America/Sao_Paulo']));

    const results = {
      processed: 0,
      paid: 0,
      expired: 0,
      reminders: 0,
      errors: 0
    };

    for (const subscription of pendingBoletos || []) {
      try {
        const userTz = tzMap.get(subscription.user_id) || 'America/Sao_Paulo';

        log("Processing subscription", {
          userId: subscription.user_id,
          stripeSubId: subscription.stripe_subscription_id,
          timezone: userTz
        });

        if (!subscription.stripe_subscription_id) {
          log("No Stripe subscription ID, skipping");
          continue;
        }

        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
        log("Stripe subscription status", { status: stripeSubscription.status });

        // Check if boleto was paid
        if (stripeSubscription.status === 'active') {
          log("Boleto was paid - updating subscription to active");

          await supabase
            .from("user_subscriptions")
            .update({
              status: "active",
              pending_payment_method: null,
              boleto_url: null,
              boleto_due_date: null,
              boleto_barcode: null,
              updated_at: new Date().toISOString()
            })
            .eq("id", subscription.id);

          await supabase
            .from("profiles")
            .update({
              subscription_status: "active",
              updated_at: new Date().toISOString()
            })
            .eq("id", subscription.user_id);

          await supabase.functions.invoke("send-boleto-subscription-notification", {
            body: {
              user_id: subscription.user_id,
              notification_type: "boleto_paid",
              plan_name: subscription.subscription_plans?.name || "Premium"
            }
          });

          results.paid++;
          results.processed++;
          continue;
        }

        // Check if boleto expired
        if (stripeSubscription.status === 'canceled' || stripeSubscription.status === 'incomplete_expired') {
          log("Boleto expired - downgrading to free plan");

          const { data: freePlan } = await supabase
            .from("subscription_plans")
            .select("id")
            .eq("slug", "free")
            .single();

          await supabase
            .from("user_subscriptions")
            .update({
              status: "expired",
              pending_payment_method: null,
              boleto_url: null,
              boleto_due_date: null,
              boleto_barcode: null,
              updated_at: new Date().toISOString()
            })
            .eq("id", subscription.id);

          await supabase
            .from("profiles")
            .update({
              current_plan_id: freePlan?.id || null,
              subscription_status: "expired",
              updated_at: new Date().toISOString()
            })
            .eq("id", subscription.user_id);

          await supabase.functions.invoke("send-boleto-subscription-notification", {
            body: {
              user_id: subscription.user_id,
              notification_type: "boleto_expired",
              plan_name: subscription.subscription_plans?.name || "Premium"
            }
          });

          results.expired++;
          results.processed++;
          continue;
        }

        // ===== TIMEZONE-AWARE: Check if boleto is due tomorrow in user's local timezone =====
        if (subscription.boleto_due_date) {
          const tomorrowLocal = getTomorrowInTimezone(userTz);
          // boleto_due_date is a date string (YYYY-MM-DD) — compare directly
          const boletoDueDate = subscription.boleto_due_date.substring(0, 10); // Ensure YYYY-MM-DD

          if (boletoDueDate === tomorrowLocal) {
            log("Boleto due tomorrow (local timezone) - sending reminder", { userTz, tomorrowLocal, boletoDueDate });

            let boletoUrl = subscription.boleto_url;
            let amount = 0;

            try {
              const invoices = await stripe.invoices.list({
                subscription: subscription.stripe_subscription_id,
                limit: 1
              });

              if (invoices.data.length > 0) {
                const invoice = invoices.data[0];
                amount = invoice.amount_due;

                if (invoice.payment_intent) {
                  const pi = await stripe.paymentIntents.retrieve(invoice.payment_intent as string);
                  if (pi.next_action?.boleto_display_details?.hosted_voucher_url) {
                    boletoUrl = pi.next_action.boleto_display_details.hosted_voucher_url;
                  }
                }
              }
            } catch (e) {
              log("Error fetching invoice details", { error: (e as Error).message });
            }

            await supabase.functions.invoke("send-boleto-subscription-notification", {
              body: {
                user_id: subscription.user_id,
                notification_type: "boleto_reminder",
                boleto_url: boletoUrl,
                due_date: subscription.boleto_due_date,
                amount: amount,
                plan_name: subscription.subscription_plans?.name || "Premium"
              }
            });

            results.reminders++;
          }
        }

        results.processed++;
      } catch (subError) {
        log("Error processing subscription", {
          userId: subscription.user_id,
          error: (subError as Error).message
        });
        results.errors++;
      }
    }

    log("Processing complete", results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    log("Error", { error: (error as Error).message });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

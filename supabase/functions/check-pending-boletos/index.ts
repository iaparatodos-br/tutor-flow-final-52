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
    const { data: pendingBoletos, error: fetchError } = await supabase
      .from("user_subscriptions")
      .select(`
        *,
        subscription_plans (name)
      `)
      .eq("status", "pending_boleto")
      .eq("pending_payment_method", "boleto");

    if (fetchError) {
      throw fetchError;
    }

    log("Found pending boletos", { count: pendingBoletos?.length || 0 });

    const results = {
      processed: 0,
      paid: 0,
      expired: 0,
      reminders: 0,
      errors: 0
    };

    for (const subscription of pendingBoletos || []) {
      try {
        log("Processing subscription", { 
          userId: subscription.user_id, 
          stripeSubId: subscription.stripe_subscription_id 
        });

        if (!subscription.stripe_subscription_id) {
          log("No Stripe subscription ID, skipping");
          continue;
        }

        // Get Stripe subscription status
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
        log("Stripe subscription status", { status: stripeSubscription.status });

        // Check if boleto was paid (subscription became active)
        if (stripeSubscription.status === 'active') {
          log("Boleto was paid - updating subscription to active");
          
          // Update subscription to active
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

          // Update profile
          await supabase
            .from("profiles")
            .update({
              subscription_status: "active",
              updated_at: new Date().toISOString()
            })
            .eq("id", subscription.user_id);

          // Send confirmation email
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

        // Check if boleto expired (subscription was cancelled or incomplete_expired)
        if (stripeSubscription.status === 'canceled' || stripeSubscription.status === 'incomplete_expired') {
          log("Boleto expired - downgrading to free plan");
          
          // Get free plan
          const { data: freePlan } = await supabase
            .from("subscription_plans")
            .select("id")
            .eq("slug", "free")
            .single();

          // Update subscription to expired
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

          // Update profile to free plan
          await supabase
            .from("profiles")
            .update({
              current_plan_id: freePlan?.id || null,
              subscription_status: "expired",
              updated_at: new Date().toISOString()
            })
            .eq("id", subscription.user_id);

          // Send expiration email
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

        // Check if boleto is due tomorrow (send reminder)
        if (subscription.boleto_due_date) {
          const dueDate = new Date(subscription.boleto_due_date);
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          
          const dueDateNormalized = new Date(dueDate);
          dueDateNormalized.setHours(0, 0, 0, 0);

          if (dueDateNormalized.getTime() === tomorrow.getTime()) {
            log("Boleto due tomorrow - sending reminder");
            
            // Get latest invoice for boleto details
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

            // Send reminder email
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

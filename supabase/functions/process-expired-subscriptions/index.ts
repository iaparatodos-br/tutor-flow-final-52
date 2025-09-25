import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PROCESS-EXPIRED-SUBSCRIPTIONS] ${step}${detailsStr}`);
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep("Starting expired subscriptions processing");
    
    const now = new Date();
    logStep("Current time", { timestamp: now.toISOString() });

    // 1. Find all active subscriptions that have expired (current_period_end < now)
    const { data: expiredSubscriptions, error: expiredError } = await supabaseAdmin
      .from('user_subscriptions')
      .select(`
        id,
        user_id,
        plan_id,
        stripe_subscription_id,
        current_period_end,
        subscription_plans!inner (
          id,
          name,
          features
        ),
        profiles!user_id (
          id,
          name,
          email,
          role
        )
      `)
      .eq('status', 'active')
      .lt('current_period_end', now.toISOString());

    if (expiredError) {
      logStep("Error fetching expired subscriptions", { error: expiredError });
      throw expiredError;
    }

    if (!expiredSubscriptions || expiredSubscriptions.length === 0) {
      logStep("No expired subscriptions found");
      return new Response(JSON.stringify({ 
        success: true,
        message: 'No expired subscriptions found',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    logStep(`Found ${expiredSubscriptions.length} expired subscriptions to process`);

    let processedCount = 0;
    let errorCount = 0;

    // 2. Process each expired subscription
    for (const subscription of expiredSubscriptions) {
      try {
          const profile = Array.isArray(subscription.profiles) ? subscription.profiles[0] : subscription.profiles;
          const plan = Array.isArray(subscription.subscription_plans) ? subscription.subscription_plans[0] : subscription.subscription_plans;
          
          logStep(`Processing expired subscription for user`, {
            userId: subscription.user_id,
            userEmail: profile?.email,
            subscriptionId: subscription.id,
            expiredAt: subscription.current_period_end
          });

          // Check if user is a professor with financial module
          const isTeacherWithFinancialModule = profile?.role === 'professor' && 
            plan?.features?.financial_module === true;

        // 3. Update subscription status to expired
        const { error: updateError } = await supabaseAdmin
          .from('user_subscriptions')
          .update({
            status: 'expired',
            updated_at: now.toISOString()
          })
          .eq('id', subscription.id);

        if (updateError) {
          logStep(`Error updating subscription status`, { 
            subscriptionId: subscription.id, 
            error: updateError 
          });
          errorCount++;
          continue;
        }

        // 4. Get free plan and update user profile
        const { data: freePlan, error: freePlanError } = await supabaseAdmin
          .from('subscription_plans')
          .select('*')
          .eq('slug', 'free')
          .single();

        if (freePlanError || !freePlan) {
          logStep(`Error getting free plan`, { error: freePlanError });
          errorCount++;
          continue;
        }

        // Update user profile to free plan
        const { error: profileUpdateError } = await supabaseAdmin
          .from('profiles')
          .update({
            current_plan_id: freePlan.id,
            subscription_status: 'expired',
            updated_at: now.toISOString(),
          })
          .eq('id', subscription.user_id);

        if (profileUpdateError) {
          logStep(`Error updating user profile`, { 
            userId: subscription.user_id, 
            error: profileUpdateError 
          });
          errorCount++;
          continue;
        }

        // 5. If teacher had financial module, process subscription cancellation
        if (isTeacherWithFinancialModule) {
          logStep(`Processing teacher subscription cancellation`, {
            teacherId: subscription.user_id,
            teacherEmail: profile?.email
          });

          try {
            const { error: cancellationError } = await supabaseAdmin.functions.invoke(
              'handle-teacher-subscription-cancellation',
              {
                body: {
                  teacher_id: subscription.user_id,
                  cancellation_reason: 'subscription_expired',
                  previous_plan_features: plan?.features
                }
              }
            );

            if (cancellationError) {
              logStep(`Error in teacher cancellation process`, {
                teacherId: subscription.user_id,
                error: cancellationError
              });
              // Don't fail the main process for cancellation errors
            } else {
              logStep(`Teacher subscription cancellation processed successfully`, {
                teacherId: subscription.user_id
              });
            }
          } catch (cancellationError) {
            logStep(`Exception in teacher cancellation process`, {
              teacherId: subscription.user_id,
              error: cancellationError
            });
          }
        }

        logStep(`Successfully processed expired subscription`, {
          userId: subscription.user_id,
          subscriptionId: subscription.id
        });

        processedCount++;

      } catch (subscriptionError) {
        logStep(`Error processing subscription`, {
          subscriptionId: subscription.id,
          userId: subscription.user_id,
          error: subscriptionError
        });
        errorCount++;
        continue;
      }
    }

    logStep("Expired subscriptions processing completed", {
      total: expiredSubscriptions.length,
      processed: processedCount,
      errors: errorCount
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Expired subscriptions processing completed',
      total: expiredSubscriptions.length,
      processed: processedCount,
      errors: errorCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    logStep("Error in expired subscriptions processing", { error: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
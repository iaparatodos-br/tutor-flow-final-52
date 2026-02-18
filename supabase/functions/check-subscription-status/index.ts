import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper logging function for enhanced debugging
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Helper function to check if user needs student selection for plan downgrade
const checkNeedsStudentSelection = async (
  supabaseClient: any,
  userId: string,
  newPlan: any,
  currentPlan: any
) => {
  try {
    // Only check if going to a plan with fewer student slots
    if (newPlan.student_limit >= currentPlan.student_limit) {
      return null;
    }

    // Get current student count
    // Sequential queries to avoid FK join syntax (Etapa 0.6)
    const { data: studentsRaw, error: studentsError } = await supabaseClient
      .from('teacher_student_relationships')
      .select('id, student_id, student_name, created_at')
      .eq('teacher_id', userId);

    let students: any[] | null = null;
    if (!studentsError && studentsRaw && studentsRaw.length > 0) {
      const studentIds = [...new Set(studentsRaw.map(s => s.student_id))];
      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id, name, email')
        .in('id', studentIds);
      
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      students = studentsRaw.map(s => ({
        ...s,
        profiles: profileMap.get(s.student_id) || null,
      }));
    }

    if (studentsError) {
      logStep("Error fetching students for downgrade check", { error: studentsError });
      return null;
    }

    if (!students || students.length <= newPlan.student_limit) {
      return null; // No selection needed
    }

    logStep("Student selection needed", {
      currentCount: students.length,
      newLimit: newPlan.student_limit,
      needToRemove: students.length - newPlan.student_limit
    });

    return {
      students: students.map((s: any) => ({
        id: s.student_id,
        relationship_id: s.id,
        name: s.student_name || s.profiles.name,
        email: s.profiles.email,
        created_at: s.created_at
      })),
      current_count: students.length,
      target_limit: newPlan.student_limit,
      need_to_remove: students.length - newPlan.student_limit
    };
  } catch (error) {
    logStep("Exception in checkNeedsStudentSelection", { error: error instanceof Error ? error.message : 'Unknown error' });
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      logStep("Authentication failed", { 
        error: userError?.message, 
        hasUser: !!userData?.user 
      });
      
      return new Response(JSON.stringify({ 
        error: "Authentication failed", 
        code: "INVALID_SESSION" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    
    const user = userData.user;
    if (!user?.email) {
      logStep("User email not available");
      return new Response(JSON.stringify({ 
        error: "User email not available" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get ALL subscriptions from database (active or expired) to properly detect renewal
    const { data: allSubscriptions, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select(`
        *,
        subscription_plans (*)
      `)
      .eq('user_id', user.id)
      .in('status', ['active', 'expired'])
      .order('updated_at', { ascending: false });

    if (subError) throw subError;

    logStep("All user subscriptions retrieved", {
      count: allSubscriptions?.length || 0,
      subscriptions: allSubscriptions?.map(s => ({
        id: s.id,
        status: s.status,
        current_period_end: s.current_period_end,
        updated_at: s.updated_at
      }))
    });

    // Check if there's an active subscription with future period_end (ignore expired ones)
    const now = new Date();
    const activeSubscription = allSubscriptions?.find(sub => 
      sub.status === 'active' && new Date(sub.current_period_end) > now
    );

    if (activeSubscription) {
      logStep("Found ACTIVE subscription with future period_end - checking Stripe for payment failures", {
        subscriptionId: activeSubscription.id,
        status: activeSubscription.status,
        currentPeriodEnd: activeSubscription.current_period_end,
        stripeSubscriptionId: activeSubscription.stripe_subscription_id
      });

      let paymentFailure = null;

      // ALWAYS check Stripe status if we have a stripe_subscription_id
      if (activeSubscription.stripe_subscription_id) {
        const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
        
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(activeSubscription.stripe_subscription_id);
          logStep("Retrieved Stripe subscription for active sub", { 
            status: stripeSubscription.status,
            isPastDue: stripeSubscription.status === 'past_due'
          });

          // Check if subscription is in past_due or other failure states
          // IMPORTANT: Do NOT treat 'incomplete' as failure if payment method is boleto
          if (stripeSubscription.status === 'past_due' || 
              stripeSubscription.status === 'incomplete_expired') {
            
            logStep("PAYMENT FAILURE DETECTED for active subscription", {
              stripeStatus: stripeSubscription.status,
              dbStatus: activeSubscription.status
            });

            // Get latest invoice to check failure details
            const invoices = await stripe.invoices.list({
              customer: stripeSubscription.customer as string,
              limit: 5,
              status: 'open'
            });

            const failedInvoice = invoices.data.find((inv: any) => inv.status === 'open' && inv.attempt_count > 0);
            
            paymentFailure = {
              detected: true,
              status: stripeSubscription.status,
              lastFailureDate: failedInvoice?.status_transitions?.finalized_at ? 
                new Date(failedInvoice.status_transitions.finalized_at * 1000).toISOString() : null,
              attemptsCount: failedInvoice?.attempt_count || 0,
              nextAttempt: failedInvoice?.next_payment_attempt ? 
                new Date(failedInvoice.next_payment_attempt * 1000).toISOString() : null
            };

            logStep("Payment failure details", paymentFailure);
          } else if (stripeSubscription.status === 'incomplete') {
            // Check if it's a boleto payment - don't treat as failure
            logStep("Incomplete status detected, checking payment method");
            
            try {
              const invoices = await stripe.invoices.list({
                subscription: activeSubscription.stripe_subscription_id,
                limit: 1
              });

              if (invoices.data.length > 0 && invoices.data[0].payment_intent) {
                const pi = await stripe.paymentIntents.retrieve(invoices.data[0].payment_intent as string);
                const isBoleto = pi.payment_method_types?.includes('boleto') || 
                                 pi.next_action?.type === 'boleto_display_details';
                
                if (isBoleto) {
                  logStep("Boleto payment detected - not treating as failure");
                  
                  // Get boleto details
                  const boletoDetails = pi.next_action?.boleto_display_details;
                  
                  return new Response(JSON.stringify({
                    subscription: {
                      id: activeSubscription.id,
                      plan_id: activeSubscription.plan_id,
                      status: 'pending_boleto',
                      current_period_end: activeSubscription.current_period_end,
                      cancel_at_period_end: activeSubscription.cancel_at_period_end,
                      extra_students: activeSubscription.extra_students,
                      extra_cost_cents: activeSubscription.extra_cost_cents
                    },
                    plan: activeSubscription.subscription_plans,
                    pendingBoleto: {
                      detected: true,
                      boletoUrl: boletoDetails?.hosted_voucher_url || activeSubscription.boleto_url,
                      dueDate: boletoDetails?.expires_at 
                        ? new Date(boletoDetails.expires_at * 1000).toISOString() 
                        : activeSubscription.boleto_due_date,
                      barcode: boletoDetails?.number || activeSubscription.boleto_barcode,
                      amount: invoices.data[0].amount_due
                    }
                  }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                  });
                } else {
                  // Not boleto, treat as payment failure
                  paymentFailure = {
                    detected: true,
                    status: stripeSubscription.status,
                    lastFailureDate: null,
                    attemptsCount: 0,
                    nextAttempt: null
                  };
                }
              }
            } catch (boletoCheckError) {
              logStep("Error checking if boleto", { error: (boletoCheckError as Error).message });
            }
          }
        } catch (stripeError) {
          logStep("Error checking Stripe subscription status for active sub", { 
            error: stripeError instanceof Error ? stripeError.message : 'Unknown error' 
          });
          // Continue without payment failure data
        }
      }

      // Return active subscription WITH payment failure data if detected
      // Also check for pending_boleto status from database
      if (activeSubscription.status === 'pending_boleto' || activeSubscription.pending_payment_method === 'boleto') {
        return new Response(JSON.stringify({
          subscription: {
            id: activeSubscription.id,
            plan_id: activeSubscription.plan_id,
            status: 'pending_boleto',
            current_period_end: activeSubscription.current_period_end,
            cancel_at_period_end: activeSubscription.cancel_at_period_end,
            extra_students: activeSubscription.extra_students,
            extra_cost_cents: activeSubscription.extra_cost_cents
          },
          plan: activeSubscription.subscription_plans,
          pendingBoleto: {
            detected: true,
            boletoUrl: activeSubscription.boleto_url,
            dueDate: activeSubscription.boleto_due_date,
            barcode: activeSubscription.boleto_barcode
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      return new Response(JSON.stringify({
        subscription: {
          id: activeSubscription.id,
          plan_id: activeSubscription.plan_id,
          status: activeSubscription.status,
          current_period_end: activeSubscription.current_period_end,
          cancel_at_period_end: activeSubscription.cancel_at_period_end,
          extra_students: activeSubscription.extra_students,
          extra_cost_cents: activeSubscription.extra_cost_cents
        },
        plan: activeSubscription.subscription_plans,
        paymentFailure: paymentFailure
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // If no active subscription, get the most recent one (could be expired or canceled)
    const subscription = allSubscriptions?.[0];

    if (subscription) {
      logStep("Found subscription in database (no active with future period)", { 
        subscriptionId: subscription.id, 
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        stripeSubscriptionId: subscription.stripe_subscription_id
      });
      
      let paymentFailure = null;

      // ============= CRITICAL FIX: Check for NEW active subscription in Stripe =============
      // When subscription is expired/canceled in DB, check if there's a NEW active subscription in Stripe
      const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
      
      // Get Stripe customer
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      
      if (customers.data.length > 0) {
        const customerId = customers.data[0].id;
        logStep("Found Stripe customer, checking for active subscriptions", { customerId });
        
        // Get ALL active subscriptions from Stripe
        const activeStripeSubscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 5
        });
        
        logStep("Active Stripe subscriptions found", { 
          count: activeStripeSubscriptions.data.length,
          ids: activeStripeSubscriptions.data.map(s => s.id)
        });
        
        // Check if there's an active subscription DIFFERENT from the one in DB
        const newActiveSub = activeStripeSubscriptions.data.find(
          s => s.id !== subscription.stripe_subscription_id
        );
        
        if (newActiveSub) {
          logStep("🔄 NEW ACTIVE SUBSCRIPTION FOUND IN STRIPE - syncing", { 
            oldDbSubscriptionId: subscription.stripe_subscription_id,
            newStripeSubscriptionId: newActiveSub.id,
            dbStatus: subscription.status
          });
          
          // Get price_id and map to subscription plan
          const priceId = newActiveSub.items.data[0].price.id;
          logStep("Found price_id for new subscription", { priceId });
          
          const { data: plan, error: planError } = await supabaseClient
            .from('subscription_plans')
            .select('*')
            .eq('stripe_price_id', priceId)
            .maybeSingle();
          
          if (!planError && plan) {
            // Update subscription record with NEW subscription data
            const subscriptionData = {
              user_id: user.id,
              plan_id: plan.id,
              status: 'active',
              stripe_customer_id: customerId,
              stripe_subscription_id: newActiveSub.id,
              current_period_start: new Date(newActiveSub.current_period_start * 1000).toISOString(),
              current_period_end: new Date(newActiveSub.current_period_end * 1000).toISOString(),
              cancel_at_period_end: newActiveSub.cancel_at_period_end,
              extra_students: 0,
              extra_cost_cents: 0,
              updated_at: new Date().toISOString(),
              // Clear boleto fields from old subscription
              boleto_url: null,
              boleto_barcode: null,
              boleto_due_date: null,
              pending_payment_method: null
            };

            const { data: updatedSubscription, error: upsertError } = await supabaseClient
              .from('user_subscriptions')
              .upsert(subscriptionData, { onConflict: 'user_id' })
              .select(`*, subscription_plans (*)`)
              .single();

            if (!upsertError && updatedSubscription) {
              // Update user profile
              await supabaseClient
                .from('profiles')
                .update({
                  current_plan_id: plan.id,
                  subscription_status: 'active',
                  subscription_end_date: subscriptionData.current_period_end,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', user.id);

              logStep("✅ Successfully synced NEW subscription from Stripe", { 
                subscriptionId: updatedSubscription.id,
                planId: plan.id,
                planName: plan.name
              });

              return new Response(JSON.stringify({
                subscription: {
                  id: updatedSubscription.id,
                  plan_id: updatedSubscription.plan_id,
                  status: updatedSubscription.status,
                  current_period_end: updatedSubscription.current_period_end,
                  cancel_at_period_end: updatedSubscription.cancel_at_period_end,
                  extra_students: updatedSubscription.extra_students,
                  extra_cost_cents: updatedSubscription.extra_cost_cents
                },
                plan: plan
              }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
              });
            } else {
              logStep("Error upserting new subscription", { error: upsertError });
            }
          } else {
            logStep("Plan not found for new subscription", { priceId, error: planError });
          }
        } else if (activeStripeSubscriptions.data.length > 0) {
          // Same subscription ID is active in Stripe - resync status
          const sameSub = activeStripeSubscriptions.data[0];
          logStep("Same subscription is ACTIVE in Stripe but expired/inactive in DB - resyncing", {
            stripeId: sameSub.id,
            dbStatus: subscription.status
          });
          
          // Get the plan for this subscription
          const priceId = sameSub.items.data[0].price.id;
          const { data: plan } = await supabaseClient
            .from('subscription_plans')
            .select('*')
            .eq('stripe_price_id', priceId)
            .maybeSingle();
            
          if (plan) {
            // Update subscription to active
            const { data: updatedSub, error: updateErr } = await supabaseClient
              .from('user_subscriptions')
              .update({
                status: 'active',
                current_period_start: new Date(sameSub.current_period_start * 1000).toISOString(),
                current_period_end: new Date(sameSub.current_period_end * 1000).toISOString(),
                cancel_at_period_end: sameSub.cancel_at_period_end,
                updated_at: new Date().toISOString(),
                boleto_url: null,
                boleto_barcode: null,
                boleto_due_date: null,
                pending_payment_method: null
              })
              .eq('id', subscription.id)
              .select(`*, subscription_plans (*)`)
              .single();
              
            if (!updateErr && updatedSub) {
              // Update profile too
              await supabaseClient
                .from('profiles')
                .update({
                  current_plan_id: plan.id,
                  subscription_status: 'active',
                  subscription_end_date: new Date(sameSub.current_period_end * 1000).toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', user.id);
                
              logStep("✅ Resynced existing subscription to ACTIVE", { subscriptionId: updatedSub.id });
              
              return new Response(JSON.stringify({
                subscription: {
                  id: updatedSub.id,
                  plan_id: updatedSub.plan_id,
                  status: updatedSub.status,
                  current_period_end: updatedSub.current_period_end,
                  cancel_at_period_end: updatedSub.cancel_at_period_end,
                  extra_students: updatedSub.extra_students,
                  extra_cost_cents: updatedSub.extra_cost_cents
                },
                plan: plan
              }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
              });
            }
          }
        }
      }
      // ============= END CRITICAL FIX =============

      // If we have a Stripe subscription ID, check its status for payment failures
      if (subscription.stripe_subscription_id) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
          logStep("Retrieved Stripe subscription", { 
            status: stripeSubscription.status,
            pastDue: stripeSubscription.status === 'past_due'
          });

          // Check if subscription is in past_due or other failure states
          if (stripeSubscription.status === 'past_due' || 
              stripeSubscription.status === 'canceled' ||
              stripeSubscription.status === 'incomplete_expired') {
            
            // Get latest invoice to check failure details
            const invoices = await stripe.invoices.list({
              customer: stripeSubscription.customer as string,
              limit: 5,
              status: 'open'
            });

            const failedInvoice = invoices.data.find((inv: any) => inv.status === 'open' && inv.attempt_count > 0);
            
            paymentFailure = {
              detected: true,
              status: stripeSubscription.status,
              lastFailureDate: failedInvoice?.status_transitions?.payment_failed_at ? 
                new Date(failedInvoice.status_transitions.payment_failed_at * 1000).toISOString() : null,
              attemptsCount: failedInvoice?.attempt_count || 0,
              nextAttempt: failedInvoice?.next_payment_attempt ? 
                new Date(failedInvoice.next_payment_attempt * 1000).toISOString() : null
            };

            logStep("Payment failure detected", paymentFailure);
          }
        } catch (stripeError) {
          logStep("Error checking Stripe subscription status", { error: stripeError });
          // Continue without payment failure data
        }
      }
      
      // Check if active subscription is expired
      const now = new Date();
      const periodEnd = new Date(subscription.current_period_end);
      
      if ((subscription.status === 'active' && now > periodEnd) || subscription.status === 'expired') {
        logStep("Subscription is expired or expired status detected, checking for student selection need");
        
        // Update subscription status to expired (only if it's still active)
        if (subscription.status === 'active') {
          const { error: updateError } = await supabaseClient
            .from('user_subscriptions')
            .update({
              status: 'expired',
              updated_at: now.toISOString()
            })
            .eq('id', subscription.id);

          if (updateError) {
            logStep("Error updating subscription status", { error: updateError });
            throw updateError;
          }
        }

        // Get free plan
        const { data: freePlan, error: freePlanError } = await supabaseClient
          .from('subscription_plans')
          .select('*')
          .eq('slug', 'free')
          .maybeSingle();

        if (freePlanError || !freePlan) {
          logStep("Error getting free plan", { error: freePlanError });
          throw freePlanError;
        }

        // Update user profile to free plan
        const { error: profileUpdateError } = await supabaseClient
          .from('profiles')
          .update({
            current_plan_id: freePlan.id,
            subscription_status: 'expired',
            updated_at: now.toISOString(),
          })
          .eq('id', user.id);

        if (profileUpdateError) {
          logStep("Error updating user profile", { error: profileUpdateError });
          throw profileUpdateError;
        }

        // Check if user needs to select students for plan downgrade
        const needsStudentSelection = await checkNeedsStudentSelection(
          supabaseClient,
          user.id,
          freePlan,
          subscription.subscription_plans
        );

        if (needsStudentSelection) {
          logStep("User needs to select students for plan downgrade");
          
          return new Response(JSON.stringify({
            subscription: null,
            plan: freePlan,
            needs_student_selection: true,
            student_selection: needsStudentSelection,
            current_students: needsStudentSelection.students,
            previous_plan: subscription.subscription_plans
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }

        // Check if user is professor with financial module and process cancellation
        if (subscription.subscription_plans?.features?.financial_module === true) {
          logStep("User had financial module, processing teacher cancellation");
          
          try {
            const { error: cancellationError } = await supabaseClient.functions.invoke(
              'handle-teacher-subscription-cancellation',
              {
                body: {
                  teacher_id: user.id,
                  cancellation_reason: 'subscription_expired',
                  previous_plan_features: subscription.subscription_plans.features
                }
              }
            );

            if (cancellationError) {
              logStep("Error in teacher cancellation process", { error: cancellationError });
            } else {
              logStep("Teacher subscription cancellation processed successfully");
            }
          } catch (cancellationError) {
            logStep("Exception in teacher cancellation process", { error: cancellationError });
          }
        }

        logStep("Subscription marked as expired and profile updated");

        return new Response(JSON.stringify({
          subscription: null,
          plan: freePlan
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      
      logStep("Active subscription found in database", { subscriptionId: subscription.id });
      // Return active subscription with payment failure data if detected
      return new Response(JSON.stringify({
        subscription: {
          id: subscription.id,
          plan_id: subscription.plan_id,
          status: subscription.status,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
          extra_students: subscription.extra_students,
          extra_cost_cents: subscription.extra_cost_cents
        },
        plan: subscription.subscription_plans,
        paymentFailure: paymentFailure
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("No subscription in database, checking Stripe");

    // No subscription in database - check Stripe directly
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    
    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No Stripe customer found, returning free plan");
      
      // Get free plan
      const { data: freePlan } = await supabaseClient
        .from('subscription_plans')
        .select('*')
        .eq('slug', 'free')
        .maybeSingle();

      return new Response(JSON.stringify({
        subscription: null,
        plan: freePlan
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Get active subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    
    const hasActiveSub = subscriptions.data.length > 0;
    
    if (!hasActiveSub) {
      logStep("No active subscription in Stripe");
      // Get free plan
      const { data: freePlan } = await supabaseClient
        .from('subscription_plans')
        .select('*')
        .eq('slug', 'free')
        .maybeSingle();

      return new Response(JSON.stringify({
        subscription: null,
        plan: freePlan
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Active subscription found in Stripe - sync to database ONLY if no local subscription exists
    const stripeSubscription = subscriptions.data[0];
    logStep("Active subscription found in Stripe", { 
      subscriptionId: stripeSubscription.id, 
      status: stripeSubscription.status 
    });

    // Get price_id and map to subscription plan
    const priceId = stripeSubscription.items.data[0].price.id;
    logStep("Found price_id", { priceId });

    const { data: plan, error: planError } = await supabaseClient
      .from('subscription_plans')
      .select('*')
      .eq('stripe_price_id', priceId)
      .maybeSingle();

    if (planError || !plan) {
      logStep("Plan not found for price_id", { priceId, error: planError });
      throw new Error(`Plan not found for price_id: ${priceId}`);
    }

    logStep("Found plan for subscription", { planId: plan.id, planName: plan.name });

    // Create subscription record in database (upsert to handle refresh cases)
    const subscriptionData = {
      user_id: user.id,
      plan_id: plan.id,
      status: 'active',
      stripe_customer_id: customerId,
      stripe_subscription_id: stripeSubscription.id,
      current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: stripeSubscription.cancel_at_period_end,
      extra_students: 0,
      extra_cost_cents: 0,
      updated_at: new Date().toISOString(),
    };

    const { data: newSubscription, error: upsertError } = await supabaseClient
      .from('user_subscriptions')
      .upsert(subscriptionData, { onConflict: 'user_id' })
      .select()
      .single();

    if (upsertError) {
      logStep("Error upserting subscription", { error: upsertError });
      throw upsertError;
    }

    // Update user profile
    await supabaseClient
      .from('profiles')
      .update({
        current_plan_id: plan.id,
        subscription_status: 'active',
        subscription_end_date: subscriptionData.current_period_end,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    logStep("Successfully synced subscription from Stripe to database", { 
      subscriptionId: newSubscription.id,
      planId: plan.id 
    });

    return new Response(JSON.stringify({
      subscription: {
        id: newSubscription.id,
        plan_id: newSubscription.plan_id,
        status: newSubscription.status,
        current_period_end: newSubscription.current_period_end,
        cancel_at_period_end: newSubscription.cancel_at_period_end,
        extra_students: newSubscription.extra_students,
        extra_cost_cents: newSubscription.extra_cost_cents
      },
      plan: plan
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logStep("ERROR in check-subscription", { 
      message: errorMessage, 
      stack: errorStack,
      timestamp: new Date().toISOString()
    });
    
    return new Response(JSON.stringify({ 
      error: 'Erro interno do servidor',
      details: errorMessage,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-STRIPE-ACCOUNT-STATUS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { account_id } = await req.json();
    
    if (!account_id) {
      throw new Error("account_id is required");
    }
    
    logStep("Request data", { account_id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Verify account belongs to the authenticated user
    const { data: connectAccount, error: connectAccountError } = await supabaseClient
      .from("stripe_connect_accounts")
      .select("*")
      .eq("stripe_account_id", account_id)
      .eq("teacher_id", user.id)
      .single();

    if (connectAccountError || !connectAccount) {
      throw new Error("Stripe Connect account not found or doesn't belong to you");
    }

    logStep("Connect account verified", { accountId: account_id });

    // Fetch current account status from Stripe
    const account = await stripe.accounts.retrieve(account_id);
    logStep("Account retrieved from Stripe", { 
      accountId: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled
    });

    // Determine account status based on restrictions and capabilities
    let accountStatus = 'active';
    let statusReason = null;
    let chargesDisabledReason = null;
    let payoutsDisabledReason = null;
    
    // Check for account restrictions
    if (account.requirements?.disabled_reason) {
      accountStatus = 'restricted';
      statusReason = account.requirements.disabled_reason;
    } else if (!account.charges_enabled || !account.payouts_enabled) {
      accountStatus = 'pending';
      statusReason = 'Account setup incomplete';
    }
    
    // Check specific reasons for disabled charges/payouts
    if (!account.charges_enabled) {
      if (account.requirements?.currently_due?.length > 0) {
        chargesDisabledReason = 'Missing required information';
      } else if (account.requirements?.past_due?.length > 0) {
        chargesDisabledReason = 'Past due requirements';
      }
    }
    
    if (!account.payouts_enabled) {
      if (account.requirements?.currently_due?.length > 0) {
        payoutsDisabledReason = 'Missing required information';
      } else if (account.requirements?.past_due?.length > 0) {
        payoutsDisabledReason = 'Past due requirements';
      }
    }

    // Update database with current status
    const { error: updateError } = await supabaseClient
      .from("stripe_connect_accounts")
      .update({
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        requirements: account.requirements,
        capabilities: account.capabilities,
        account_status: accountStatus,
        status_reason: statusReason,
        restrictions: account.requirements || {},
        charges_disabled_reason: chargesDisabledReason,
        payouts_disabled_reason: payoutsDisabledReason,
        last_status_check: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("stripe_account_id", account_id);

    if (updateError) {
      logStep("Error updating account status", updateError);
      throw new Error(`Database update error: ${updateError.message}`);
    }

    logStep("Account status updated successfully");

    return new Response(JSON.stringify({
      account_id: account.id,
      account_status: accountStatus,
      status_reason: statusReason,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      charges_disabled_reason: chargesDisabledReason,
      payouts_disabled_reason: payoutsDisabledReason,
      requirements: account.requirements
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-stripe-account-status", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
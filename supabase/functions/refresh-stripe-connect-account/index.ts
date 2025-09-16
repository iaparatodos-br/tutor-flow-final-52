import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function logStep(step: string, details?: any) {
  console.log(`[REFRESH-STRIPE-CONNECT] ${step}`, details ? `- ${JSON.stringify(details)}` : '');
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  logStep("Function started");

  try {
    // Get environment variables
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeSecretKey || !supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error("Missing required environment variables");
    }

    // Create Supabase client for authentication
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("User not authenticated");
    }

    logStep("User authenticated", { userId: user.id });

    // Create service client for database operations
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    const { payment_account_id } = await req.json();
    
    if (!payment_account_id) {
      throw new Error("payment_account_id is required");
    }
    
    logStep("Request data", { payment_account_id });

    // Get user's Stripe Connect account for the specific payment account
    const { data: connectAccount, error: accountError } = await supabaseService
      .from('stripe_connect_accounts')
      .select('*')
      .eq('payment_account_id', payment_account_id)
      .eq('teacher_id', user.id)
      .single();

    if (accountError || !connectAccount) {
      throw new Error("Stripe Connect account not found");
    }

    logStep("Connect account found", { accountId: connectAccount.stripe_account_id });

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    // Fetch latest account data from Stripe
    const stripeAccount = await stripe.accounts.retrieve(connectAccount.stripe_account_id);
    
    logStep("Stripe account retrieved", {
      accountId: stripeAccount.id,
      chargesEnabled: stripeAccount.charges_enabled,
      payoutsEnabled: stripeAccount.payouts_enabled,
      detailsSubmitted: stripeAccount.details_submitted
    });

    // Update database with latest data
    const { error: updateError } = await supabaseService
      .from('stripe_connect_accounts')
      .update({
        charges_enabled: stripeAccount.charges_enabled,
        payouts_enabled: stripeAccount.payouts_enabled,
        details_submitted: stripeAccount.details_submitted,
        requirements: stripeAccount.requirements,
        capabilities: stripeAccount.capabilities,
        updated_at: new Date().toISOString()
      })
      .eq('payment_account_id', payment_account_id)
      .eq('teacher_id', user.id);

    if (updateError) {
      throw updateError;
    }

    logStep("Database updated successfully");

    // Also update payment_accounts table if it exists
    const { error: paymentAccountError } = await supabaseService
      .from('payment_accounts')
      .update({
        stripe_charges_enabled: stripeAccount.charges_enabled,
        stripe_payouts_enabled: stripeAccount.payouts_enabled,
        stripe_details_submitted: stripeAccount.details_submitted,
        stripe_onboarding_status: stripeAccount.details_submitted ? 'completed' : 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', payment_account_id);

    logStep("Payment accounts updated", { error: paymentAccountError });

    return new Response(
      JSON.stringify({
        success: true,
        account: {
          id: stripeAccount.id,
          charges_enabled: stripeAccount.charges_enabled,
          payouts_enabled: stripeAccount.payouts_enabled,
          details_submitted: stripeAccount.details_submitted
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    logStep("Error occurred", { error: error.message });
    
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
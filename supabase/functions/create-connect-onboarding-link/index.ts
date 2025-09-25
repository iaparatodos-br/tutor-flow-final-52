import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-ONBOARDING-LINK] ${step}${detailsStr}`);
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

    const { payment_account_id, stripe_account_id } = await req.json();
    
    if (!payment_account_id && !stripe_account_id) {
      throw new Error("payment_account_id or stripe_account_id is required");
    }
    
    logStep("Request data", { payment_account_id, stripe_account_id });

    let connectAccount;

    if (stripe_account_id) {
      // Se recebemos stripe_account_id diretamente, usar ele
      connectAccount = { stripe_account_id };
      logStep("Using provided stripe_account_id", { stripe_account_id });
    } else {
      // Buscar na tabela stripe_connect_accounts usando payment_account_id
      const { data: account, error: accountError } = await supabaseClient
        .from("stripe_connect_accounts")
        .select("*")
        .eq("payment_account_id", payment_account_id)
        .eq("teacher_id", user.id)
        .single();

      if (accountError || !account) {
        throw new Error("No Stripe Connect account found. Create one first.");
      }
      connectAccount = account;
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const origin = req.headers.get("origin") || "https://www.tutor-flow.app";

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: connectAccount.stripe_account_id,
      refresh_url: `${origin}/contas-recebimento?refresh=true`,
      return_url: `${origin}/contas-recebimento?success=true`,
      type: "account_onboarding",
    });

    logStep("Onboarding link created", { 
      accountId: connectAccount.stripe_account_id,
      url: accountLink.url 
    });

    return new Response(JSON.stringify({
      url: accountLink.url,
      expires_at: accountLink.expires_at
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-onboarding-link", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
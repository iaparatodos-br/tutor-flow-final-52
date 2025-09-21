import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-BUSINESS-PROFILE] ${step}${detailsStr}`);
};

interface CreateBusinessProfileRequest {
  business_name: string;
  cnpj?: string;
  account_type?: 'express' | 'standard';
  country?: string;
}

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
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const body: CreateBusinessProfileRequest = await req.json();
    
    if (!body.business_name) {
      throw new Error("business_name is required");
    }

    const { business_name, cnpj, account_type = "express", country = "BR" } = body;
    
    logStep("Request data", { business_name, cnpj, account_type, country });

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Create Stripe Connect account
    const account = await stripe.accounts.create({
      type: account_type,
      country: country,
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      business_type: cnpj ? "company" : "individual",
      metadata: {
        user_id: user.id,
        business_name: business_name,
        cnpj: cnpj || "",
        platform: "tutor-flow"
      }
    });

    logStep("Stripe Connect account created", { accountId: account.id });

    // Create business profile in database
    const { data: businessProfile, error: insertError } = await supabaseClient
      .from("business_profiles")
      .insert({
        user_id: user.id,
        business_name: business_name,
        cnpj: cnpj || null,
        stripe_connect_id: account.id,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      logStep("Error saving business profile to database", insertError);
      
      // If database insert fails, delete the Stripe account to maintain consistency
      try {
        await stripe.accounts.del(account.id);
        logStep("Stripe account deleted due to database error");
      } catch (deleteError) {
        logStep("Error deleting Stripe account after database failure", deleteError);
      }
      
      throw new Error(`Database error: ${insertError.message}`);
    }

    logStep("Business profile saved to database successfully", { businessProfileId: businessProfile.id });

    // Create onboarding link for Express accounts
    let onboardingUrl = null;
    if (account_type === "express") {
      try {
        const accountLink = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: `${Deno.env.get("SITE_URL") || "https://localhost:3000"}/configuracoes/contas-recebimento?refresh=true`,
          return_url: `${Deno.env.get("SITE_URL") || "https://localhost:3000"}/configuracoes/contas-recebimento?success=true`,
          type: "account_onboarding",
        });
        
        onboardingUrl = accountLink.url;
        logStep("Onboarding link created", { url: onboardingUrl });
      } catch (linkError) {
        logStep("Error creating onboarding link", linkError);
        // Don't fail the request if onboarding link creation fails
      }
    }

    return new Response(JSON.stringify({
      success: true,
      business_profile: {
        id: businessProfile.id,
        business_name: businessProfile.business_name,
        cnpj: businessProfile.cnpj,
        stripe_connect_id: businessProfile.stripe_connect_id,
        is_active: businessProfile.is_active,
        created_at: businessProfile.created_at
      },
      stripe_account: {
        id: account.id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted
      },
      onboarding_url: onboardingUrl
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-business-profile", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
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

    const { business_name, cnpj } = await req.json();
    
    if (!business_name) {
      throw new Error("business_name is required");
    }
    
    logStep("Request data", { business_name, cnpj });

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const origin = req.headers.get("origin") || "https://www.tutor-flow.app";

    // Create Stripe Connect account
    const stripeAccount = await stripe.accounts.create({
      type: "express",
      country: "BR",
      business_type: "company",
      company: {
        name: business_name,
        tax_id: cnpj?.replace(/\D/g, ''), // Remove non-digits from CNPJ
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    logStep("Stripe Connect account created", { 
      accountId: stripeAccount.id,
      businessName: business_name 
    });

    // Save business profile to database
    const { data: businessProfile, error: dbError } = await supabaseClient
      .from("business_profiles")
      .insert({
        user_id: user.id,
        business_name,
        cnpj,
        stripe_connect_id: stripeAccount.id,
      })
      .select()
      .single();

    if (dbError) {
      logStep("Database error", { error: dbError });
      throw new Error(`Database error: ${dbError.message}`);
    }

    logStep("Business profile saved to database", { profileId: businessProfile.id });

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccount.id,
      refresh_url: `${origin}/painel/configuracoes/negocios?refresh=true`,
      return_url: `${origin}/painel/configuracoes/negocios?success=true`,
      type: "account_onboarding",
    });

    logStep("Onboarding link created", { 
      accountId: stripeAccount.id,
      url: accountLink.url 
    });

    return new Response(JSON.stringify({
      onboarding_url: accountLink.url,
      business_profile: businessProfile,
      expires_at: accountLink.expires_at
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-business-profile", { message: errorMessage });
    
    // Handle specific Stripe Connect configuration error
    if (errorMessage.includes("review the responsibilities of managing losses")) {
      return new Response(JSON.stringify({ 
        error: "Configuração do Stripe Connect necessária",
        details: "É necessário configurar o perfil da plataforma no Stripe Dashboard antes de criar contas conectadas.",
        action_required: "Acesse https://dashboard.stripe.com/settings/connect/platform-profile e complete a configuração.",
        technical_error: errorMessage
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
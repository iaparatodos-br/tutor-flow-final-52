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

    // Check for duplicate CNPJ across business_profiles and pending_business_profiles
    if (cnpj) {
      const cnpjClean = cnpj.replace(/\D/g, '');

      const [{ data: existingBusiness }, { data: existingPending }] = await Promise.all([
        supabaseClient
          .from("business_profiles")
          .select("id, business_name")
          .eq("cnpj", cnpj)
          .maybeSingle(),
        supabaseClient
          .from("pending_business_profiles")
          .select("id, business_name")
          .eq("cnpj", cnpj)
          .maybeSingle(),
      ]);

      if (existingBusiness || existingPending) {
        logStep("Duplicate CNPJ found", { cnpj: cnpjClean, inBusiness: !!existingBusiness, inPending: !!existingPending });
        return new Response(JSON.stringify({
          error: "Este CNPJ já está em uso por outro perfil de negócio.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
    }

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

    // Save to pending business profiles (temporary storage until onboarding complete)
    const { data: pendingProfile, error: dbError } = await supabaseClient
      .from("pending_business_profiles")
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

    logStep("Pending business profile saved temporarily", { 
      pendingId: pendingProfile.id,
      stripeAccountId: stripeAccount.id 
    });

    // Create account link for onboarding
    let accountLink;
    try {
      accountLink = await stripe.accountLinks.create({
        account: stripeAccount.id,
        refresh_url: `${origin}/financeiro?refresh=true`,
        return_url: `${origin}/financeiro?success=true`,
        type: "account_onboarding",
      });
    } catch (linkError) {
      const linkErrorMessage = linkError instanceof Error ? linkError.message : String(linkError);
      logStep("ERROR creating account link", {
        accountId: stripeAccount.id,
        error: linkErrorMessage
      });
      return new Response(JSON.stringify({
        error: "Erro ao gerar link de onboarding do Stripe. Tente novamente.",
        technical_error: linkErrorMessage,
        pending_profile_id: pendingProfile.id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    logStep("Onboarding link created", {
      accountId: stripeAccount.id,
      url: accountLink.url
    });

    return new Response(JSON.stringify({
      onboarding_url: accountLink.url,
      pending_profile: pendingProfile,
      expires_at: accountLink.expires_at,
      message: "Complete o onboarding no Stripe para ativar seu perfil de negócio"
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

    // Handle invalid CNPJ/tax_id errors from Stripe
    if (errorMessage.includes("tax_id") || errorMessage.includes("Tax ID") || errorMessage.includes("company.tax_id")) {
      return new Response(JSON.stringify({
        error: "CNPJ inválido. Verifique se o número está correto e tente novamente.",
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
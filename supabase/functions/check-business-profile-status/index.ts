import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.24.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  console.log(`[CHECK-BUSINESS-STATUS] ${step}`, details ? JSON.stringify(details) : '');
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY not found');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    logStep('User authenticated', { userId: user.id });

    const { stripe_connect_id } = await req.json();
    if (!stripe_connect_id) {
      throw new Error('stripe_connect_id is required');
    }

    logStep('Checking status for account', { stripe_connect_id });

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

    // Get account status from Stripe
    const account = await stripe.accounts.retrieve(stripe_connect_id);
    logStep('Retrieved Stripe account', { 
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted 
    });

    // Check if account is fully onboarded
    const isOnboardingComplete = account.charges_enabled && account.payouts_enabled && account.details_submitted;
    
    if (isOnboardingComplete) {
      // Move from pending to active business profiles
      logStep('Account is complete, moving from pending to active');

      // Get pending profile
      const { data: pendingProfile, error: pendingError } = await supabaseClient
        .from('pending_business_profiles')
        .select('*')
        .eq('stripe_connect_id', stripe_connect_id)
        .eq('user_id', user.id)
        .single();

      if (pendingError || !pendingProfile) {
        logStep('No pending profile found', { error: pendingError });
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Perfil pendente não encontrado' 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create business profile
      const { data: businessProfile, error: createError } = await supabaseClient
        .from('business_profiles')
        .insert({
          user_id: user.id,
          business_name: pendingProfile.business_name,
          cnpj: pendingProfile.cnpj,
          stripe_connect_id: stripe_connect_id
        })
        .select()
        .single();

      if (createError) {
        logStep('Error creating business profile', { error: createError });
        throw createError;
      }

      // Create payment account
      const { error: paymentAccountError } = await supabaseClient
        .from('payment_accounts')
        .insert({
          teacher_id: user.id,
          account_name: pendingProfile.business_name,
          account_type: 'stripe_connect',
          stripe_connect_account_id: stripe_connect_id,
          stripe_account_id: stripe_connect_id,
          stripe_charges_enabled: account.charges_enabled,
          stripe_payouts_enabled: account.payouts_enabled,
          stripe_details_submitted: account.details_submitted,
          stripe_onboarding_status: 'completed',
          is_active: true
        });

      if (paymentAccountError) {
        logStep('Error creating payment account', { error: paymentAccountError });
        throw paymentAccountError;
      }

      // Create stripe connect account record
      const { error: stripeConnectError } = await supabaseClient
        .from('stripe_connect_accounts')
        .insert({
          teacher_id: user.id,
          stripe_account_id: stripe_connect_id,
          account_type: 'express',
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          account_status: 'active'
        });

      if (stripeConnectError) {
        logStep('Error creating stripe connect account', { error: stripeConnectError });
        throw stripeConnectError;
      }

      // Remove pending profile
      const { error: deleteError } = await supabaseClient
        .from('pending_business_profiles')
        .delete()
        .eq('id', pendingProfile.id);

      if (deleteError) {
        logStep('Error deleting pending profile', { error: deleteError });
        throw deleteError;
      }

      logStep('Successfully activated business profile', { businessProfileId: businessProfile.id });

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Perfil de negócio ativado com sucesso!',
        business_profile: businessProfile
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      logStep('Account onboarding not complete', { 
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted 
      });

      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Cadastro ainda não foi completado no Stripe',
        account_status: {
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor';
    logStep('Error in check-business-profile-status', { error: errorMessage });
    
    return new Response(JSON.stringify({ 
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
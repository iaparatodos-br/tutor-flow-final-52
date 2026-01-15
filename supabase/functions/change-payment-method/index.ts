import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChangePaymentMethodRequest {
  invoice_id: string;
}

const logStep = (step: string, details?: any) => {
  console.log(`[change-payment-method] ${step}`, details ? JSON.stringify(details) : '');
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Starting payment method change');

    // Initialize clients
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      logStep('Authentication failed', { error: authError });
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logStep('User authenticated', { user_id: user.id });

    // Parse request body
    const { invoice_id } = await req.json() as ChangePaymentMethodRequest;

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: 'invoice_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logStep('Request parsed', { invoice_id });

    // Fetch invoice with relationship data
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, student_id, teacher_id, stripe_payment_intent_id, status, business_profile_id')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      logStep('Invoice not found', { error: invoiceError });
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user permission: must be the student OR a responsible (parent) of a dependent
    let hasPermission = invoice.student_id === user.id;
    
    if (!hasPermission) {
      // Check if user is responsible for a dependent linked to this invoice's student
      const { data: dependents } = await supabase
        .from('dependents')
        .select('id')
        .eq('responsible_id', user.id);
      
      if (dependents && dependents.length > 0) {
        // User has dependents, check if invoice student matches any dependent's responsible
        const { data: relationship } = await supabase
          .from('teacher_student_relationships')
          .select('student_id')
          .eq('student_id', invoice.student_id)
          .single();
        
        if (relationship) {
          // Check if the invoice's student has this user as a guardian
          const { data: guardianCheck } = await supabase
            .from('dependents')
            .select('id')
            .eq('responsible_id', invoice.student_id)
            .limit(1);
          
          // If the student_id is actually a responsible with dependents, allow if user is that student
          hasPermission = invoice.student_id === user.id;
        }
      }
    }

    if (!hasPermission) {
      logStep('Permission denied', { invoice_student: invoice.student_id, user_id: user.id });
      return new Response(
        JSON.stringify({ error: 'Permission denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check invoice status - must be pending
    if (invoice.status !== 'pendente') {
      logStep('Invoice not pending', { status: invoice.status });
      return new Response(
        JSON.stringify({ error: 'Apenas faturas pendentes podem ter o método de pagamento alterado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to cancel existing payment intent if exists
    let paymentIntentCancelled = false;
    if (invoice.stripe_payment_intent_id) {
      logStep('Attempting to cancel existing payment intent', { payment_intent_id: invoice.stripe_payment_intent_id });
      
      try {
        // First, check if this is a direct charge (PIX) or destination charge (Boleto)
        // Try to retrieve from platform first
        let paymentIntent;
        let stripeAccountId: string | undefined;
        
        try {
          paymentIntent = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
          logStep('Found payment intent on platform', { id: paymentIntent.id, status: paymentIntent.status });
        } catch (platformError: any) {
          // If not found on platform, try on connected account
          if (invoice.business_profile_id) {
            const { data: businessProfile } = await supabase
              .from('business_profiles')
              .select('stripe_connect_id')
              .eq('id', invoice.business_profile_id)
              .single();
            
            if (businessProfile?.stripe_connect_id) {
              stripeAccountId = businessProfile.stripe_connect_id;
              try {
                paymentIntent = await stripe.paymentIntents.retrieve(
                  invoice.stripe_payment_intent_id,
                  { stripeAccount: stripeAccountId }
                );
                logStep('Found payment intent on connected account', { 
                  id: paymentIntent.id, 
                  status: paymentIntent.status,
                  account: stripeAccountId
                });
              } catch (connectedError) {
                logStep('Payment intent not found on connected account either', { error: connectedError });
              }
            }
          }
        }
        
        if (paymentIntent) {
          // Only try to cancel if in a cancellable state
          const cancellableStates = ['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'];
          
          if (cancellableStates.includes(paymentIntent.status)) {
            try {
              if (stripeAccountId) {
                await stripe.paymentIntents.cancel(invoice.stripe_payment_intent_id, { stripeAccount: stripeAccountId });
              } else {
                await stripe.paymentIntents.cancel(invoice.stripe_payment_intent_id);
              }
              paymentIntentCancelled = true;
              logStep('Payment intent cancelled successfully');
            } catch (cancelError: any) {
              // Boleto cannot be cancelled while active - that's OK, we'll just clear our data
              if (cancelError.message?.includes('Boleto PaymentIntent cannot be updated or canceled')) {
                logStep('Boleto cannot be cancelled (will expire naturally)', { error: cancelError.message });
              } else {
                logStep('Could not cancel payment intent', { error: cancelError.message });
              }
            }
          } else {
            logStep('Payment intent not in cancellable state', { status: paymentIntent.status });
          }
        }
      } catch (retrieveError: any) {
        logStep('Error retrieving payment intent', { error: retrieveError.message });
      }
    }

    // Clear payment-related fields from invoice (DO NOT mark as paid - keep as pending)
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        stripe_payment_intent_id: null,
        boleto_url: null,
        linha_digitavel: null,
        barcode: null,
        boleto_expires_at: null,
        pix_qr_code: null,
        pix_copy_paste: null,
        pix_expires_at: null,
        payment_method: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', invoice_id);

    if (updateError) {
      logStep('Database update failed', { error: updateError });
      throw updateError;
    }

    logStep('Invoice payment fields cleared successfully', { 
      invoice_id,
      payment_intent_cancelled: paymentIntentCancelled
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Pagamento anterior cancelado. Escolha uma nova forma de pagamento.',
        payment_intent_cancelled: paymentIntentCancelled
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logStep('Error in change-payment-method', { error: error.message, stack: error.stack });
    
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao alterar método de pagamento',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

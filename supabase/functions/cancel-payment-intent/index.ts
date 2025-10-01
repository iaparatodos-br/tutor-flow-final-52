import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CancelPaymentIntentRequest {
  invoice_id: string;
  notes?: string;
}

const logStep = (step: string, details?: any) => {
  console.log(`[cancel-payment-intent] ${step}`, details ? JSON.stringify(details) : '');
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Starting payment intent cancellation');

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
    const { invoice_id, notes } = await req.json() as CancelPaymentIntentRequest;

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: 'invoice_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logStep('Request parsed', { invoice_id, has_notes: !!notes });

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, teacher_id, stripe_payment_intent_id, status, payment_origin')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      logStep('Invoice not found', { error: invoiceError });
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is the teacher
    if (invoice.teacher_id !== user.id) {
      logStep('Permission denied', { invoice_teacher: invoice.teacher_id, user_id: user.id });
      return new Response(
        JSON.stringify({ error: 'Permission denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already marked as manual payment
    if (invoice.payment_origin === 'manual') {
      logStep('Invoice already marked as manual payment');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Invoice was already marked as manual payment',
          already_processed: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if invoice has a payment intent
    if (!invoice.stripe_payment_intent_id) {
      logStep('No payment intent to cancel', { invoice_id });
      
      // Still mark as manual payment even without payment intent
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          status: 'paid',
          payment_origin: 'manual',
          payment_intent_cancelled_by: user.id,
          payment_intent_cancelled_at: new Date().toISOString(),
          manual_payment_notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', invoice_id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Invoice marked as paid (no payment intent to cancel)',
          payment_intent_cancelled: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logStep('Attempting to cancel payment intent', { payment_intent_id: invoice.stripe_payment_intent_id });

    // Try to cancel the payment intent on Stripe
    let paymentIntentCancelled = false;
    let cancellationError = null;

    try {
      const canceledPaymentIntent = await stripe.paymentIntents.cancel(
        invoice.stripe_payment_intent_id
      );
      
      logStep('Payment intent cancelled successfully', { 
        payment_intent_id: canceledPaymentIntent.id,
        status: canceledPaymentIntent.status
      });
      
      paymentIntentCancelled = true;
    } catch (stripeError: any) {
      logStep('Stripe cancellation error', { error: stripeError.message, code: stripeError.code });
      
      // Check if error is because payment intent is already in a final state
      if (stripeError.code === 'payment_intent_unexpected_state') {
        logStep('Payment intent already in final state', { payment_intent_id: invoice.stripe_payment_intent_id });
        cancellationError = 'Payment intent is already in a final state (succeeded, canceled, or failed)';
      } else {
        // For other errors, throw to be caught by outer try-catch
        throw stripeError;
      }
    }

    // Update invoice in database
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        payment_origin: 'manual',
        payment_intent_cancelled_by: user.id,
        payment_intent_cancelled_at: new Date().toISOString(),
        manual_payment_notes: notes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', invoice_id);

    if (updateError) {
      logStep('Database update failed', { error: updateError });
      throw updateError;
    }

    // Register audit log
    const { error: auditError } = await supabase.from('audit_logs').insert({
      actor_id: user.id,
      target_teacher_id: invoice.teacher_id,
      table_name: 'invoices',
      record_id: invoice_id,
      operation: 'UPDATE',
      old_data: { status: invoice.status, payment_origin: invoice.payment_origin },
      new_data: { 
        status: 'paid', 
        payment_origin: 'manual',
        payment_intent_cancelled: paymentIntentCancelled,
        manual_payment_notes: notes 
      },
    });

    if (auditError) {
      logStep('Audit log failed (non-critical)', { error: auditError });
    }

    logStep('Invoice updated successfully and audited', { invoice_id });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: paymentIntentCancelled 
          ? 'Payment intent cancelled and invoice marked as paid'
          : 'Invoice marked as paid (payment intent already in final state)',
        payment_intent_cancelled: paymentIntentCancelled,
        cancellation_note: cancellationError
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logStep('Error in cancel-payment-intent', { error: error.message, stack: error.stack });
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to cancel payment intent',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

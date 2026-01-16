import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHANGE-PAYMENT-METHOD] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { invoice_id } = await req.json();
    if (!invoice_id) throw new Error("invoice_id is required");

    // Fetch invoice with related data
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select(`
        *,
        student:profiles!invoices_student_id_fkey(id, name, email),
        teacher:profiles!invoices_teacher_id_fkey(id, name)
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("Invoice not found");
    }

    logStep("Invoice found", { 
      invoiceId: invoice_id, 
      studentId: invoice.student_id,
      status: invoice.status,
      currentPaymentMethod: invoice.payment_method,
      hasStripePI: !!invoice.stripe_payment_intent_id
    });

    // v2.2: Authorization - Check if user is the student, a guardian of a dependent, or the responsible
    const isStudent = invoice.student_id === user.id;
    
    // Check if user is a guardian of a dependent whose invoice this is
    let isGuardian = false;
    if (!isStudent) {
      const { data: dependentCheck } = await supabaseClient
        .from('dependents')
        .select('id, responsible_id')
        .eq('responsible_id', user.id)
        .limit(1);
      
      if (dependentCheck && dependentCheck.length > 0) {
        // User has dependents, check if invoice student_id matches any of their responsible accounts
        const { data: responsibleRelation } = await supabaseClient
          .from('dependents')
          .select('id')
          .eq('responsible_id', invoice.student_id)
          .eq('responsible_id', user.id)
          .limit(1);
        
        if (responsibleRelation && responsibleRelation.length > 0) {
          isGuardian = true;
        }
      }
    }

    // Also check if the user is the responsible for the student via relationship
    let isResponsible = false;
    if (!isStudent && !isGuardian) {
      // Check if user has any relationship where they might be responsible
      const { data: relationshipCheck } = await supabaseClient
        .from('teacher_student_relationships')
        .select('id')
        .eq('student_id', invoice.student_id)
        .limit(1);
      
      // If user.id matches student_id, they're the responsible
      if (invoice.student_id === user.id) {
        isResponsible = true;
      }
    }

    if (!isStudent && !isGuardian && !isResponsible) {
      logStep("Authorization failed", { 
        userId: user.id, 
        studentId: invoice.student_id,
        isStudent,
        isGuardian,
        isResponsible
      });
      throw new Error("Você não tem permissão para alterar o método de pagamento desta fatura");
    }

    logStep("Authorization passed", { isStudent, isGuardian, isResponsible });

    // v2.2: Validate invoice status - only allow changes for pending/failed invoices
    const allowedStatuses = ['pendente', 'open', 'falha_pagamento'];
    if (!allowedStatuses.includes(invoice.status)) {
      logStep("Invalid status for payment method change", { status: invoice.status });
      throw new Error(`Não é possível alterar o método de pagamento de uma fatura com status \"${invoice.status}\"`);
    }

    // Store old data for audit log
    const oldPaymentData = {
      payment_method: invoice.payment_method,
      stripe_payment_intent_id: invoice.stripe_payment_intent_id,
      boleto_url: invoice.boleto_url,
      pix_qr_code: invoice.pix_qr_code,
      pix_expires_at: invoice.pix_expires_at,
      boleto_expires_at: invoice.boleto_expires_at
    };

    // v2.1: Cancel existing Stripe Payment Intent if exists
    let stripeCancelled = false;
    if (invoice.stripe_payment_intent_id) {
      logStep("Attempting to cancel existing payment intent", { 
        paymentIntentId: invoice.stripe_payment_intent_id 
      });

      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey) {
        try {
          const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
          
          // Retrieve PI to check status
          const pi = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
          
          if (pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation' || pi.status === 'requires_action') {
            // Can cancel
            await stripe.paymentIntents.cancel(invoice.stripe_payment_intent_id);
            stripeCancelled = true;
            logStep("Payment intent cancelled successfully", { 
              paymentIntentId: invoice.stripe_payment_intent_id,
              previousStatus: pi.status
            });
          } else {
            logStep("Payment intent cannot be cancelled", { 
              paymentIntentId: invoice.stripe_payment_intent_id,
              status: pi.status
            });
          }
        } catch (stripeError: any) {
          logStep("Error cancelling payment intent (continuing anyway)", { 
            error: stripeError.message 
          });
          // Don't fail the operation, just log and continue
        }
      }
    }

    // Clear all payment-related fields
    const clearFields = {
      payment_method: null,
      stripe_payment_intent_id: null,
      stripe_hosted_invoice_url: null,
      stripe_invoice_id: null,
      stripe_invoice_url: null,
      boleto_url: null,
      linha_digitavel: null,
      barcode: null,
      boleto_expires_at: null,
      pix_qr_code: null,
      pix_copy_paste: null,
      pix_expires_at: null,
      payment_intent_cancelled_at: new Date().toISOString(),
      payment_intent_cancelled_by: user.id,
      // Keep status as pendente so user can choose new method
      status: 'pendente',
      updated_at: new Date().toISOString()
    };

    const { error: updateError } = await supabaseClient
      .from("invoices")
      .update(clearFields)
      .eq("id", invoice_id);

    if (updateError) {
      logStep("Error updating invoice", updateError);
      throw new Error(`Database error: ${updateError.message}`);
    }

    logStep("Invoice payment data cleared", { invoiceId: invoice_id });

    // v2.6: Register audit log
    try {
      await supabaseClient.from('audit_logs').insert({
        actor_id: user.id,
        target_teacher_id: invoice.teacher_id,
        table_name: 'invoices',
        operation: 'PAYMENT_METHOD_CHANGED',
        record_id: invoice_id,
        old_data: oldPaymentData,
        new_data: {
          payment_method: null,
          stripe_payment_intent_id: null,
          status: 'pendente',
          changed_by: isStudent ? 'student' : (isGuardian ? 'guardian' : 'responsible'),
          stripe_cancelled: stripeCancelled
        }
      });
      
      logStep('✓ Audit log registered');
    } catch (auditError) {
      // Não falhar a operação por erro no audit log
      logStep('⚠️ Falha ao registrar audit log (não crítico)', { auditError });
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Método de pagamento removido. Você pode escolher um novo método de pagamento.",
      invoice_id: invoice_id,
      stripe_cancelled: stripeCancelled
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in change-payment-method", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage, success: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

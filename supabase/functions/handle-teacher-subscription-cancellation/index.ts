import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CancellationRequest {
  teacher_id: string;
  cancellation_reason: string;
  previous_plan_features?: any;
}

interface ProcessingReport {
  teacher_id: string;
  students_affected: number;
  invoices_found: number;
  invoices_voided: number;
  invoices_already_paid: number;
  invoices_failed: number;
  processing_time_ms: number;
  errors: string[];
}

// Helper logging function for debugging
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TEACHER-CANCELLATION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseService = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");
    
    const { teacher_id, cancellation_reason, previous_plan_features }: CancellationRequest = await req.json();
    
    if (!teacher_id) {
      throw new Error("teacher_id is required");
    }

    logStep("Processing cancellation", { teacher_id, cancellation_reason });

    // 1. Verify if teacher had financial_module in previous plan
    const hadFinancialModule = previous_plan_features?.financial_module === true;
    
    if (!hadFinancialModule) {
      logStep("Teacher didn't have financial module, skipping");
      return new Response(JSON.stringify({
        success: true,
        message: "Teacher didn't have financial module, no cancellations needed"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. Find all pending invoices for this teacher's students
    const { data: pendingInvoices, error: invoicesError } = await supabaseService
      .from('invoices')
      .select('*')
      .eq('teacher_id', teacher_id)
      .eq('status', 'pendente');

    if (invoicesError) {
      throw new Error(`Failed to fetch invoices: ${invoicesError.message}`);
    }

    logStep("Found pending invoices", { count: pendingInvoices?.length || 0 });

    if (!pendingInvoices || pendingInvoices.length === 0) {
      logStep("No pending invoices found");
      return new Response(JSON.stringify({
        success: true,
        message: "No pending invoices found for this teacher"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    const report: ProcessingReport = {
      teacher_id,
      students_affected: [...new Set(pendingInvoices.map(inv => inv.student_id))].length,
      invoices_found: pendingInvoices.length,
      invoices_voided: 0,
      invoices_already_paid: 0,
      invoices_failed: 0,
      processing_time_ms: 0,
      errors: []
    };

    const voidedInvoices: any[] = [];
    const paidInvoices: any[] = [];
    const failedInvoices: any[] = [];

    // 3. Process each invoice
    for (const invoice of pendingInvoices) {
      try {
        logStep("Processing invoice", { invoice_id: invoice.id, stripe_invoice_id: invoice.stripe_invoice_id });

        // Check if invoice has Stripe ID and verify its status
        if (invoice.stripe_invoice_id) {
          const stripeInvoice = await stripe.invoices.retrieve(invoice.stripe_invoice_id);
          
          if (stripeInvoice.status === 'paid') {
            // Invoice was already paid
            logStep("Invoice already paid", { invoice_id: invoice.id });
            paidInvoices.push(invoice);
            report.invoices_already_paid++;
            continue;
          }

          if (stripeInvoice.status === 'open' || stripeInvoice.status === 'draft') {
            // Void the invoice in Stripe
            await stripe.invoices.voidInvoice(invoice.stripe_invoice_id);
            logStep("Voided Stripe invoice", { stripe_invoice_id: invoice.stripe_invoice_id });
          }
        }

        // Update invoice status in database
        const { error: updateError } = await supabaseService
          .from('invoices')
          .update({ 
            status: 'cancelada_por_professor_inativo',
            updated_at: new Date().toISOString()
          })
          .eq('id', invoice.id);

        if (updateError) {
          throw new Error(`Failed to update invoice: ${updateError.message}`);
        }

        voidedInvoices.push(invoice);
        report.invoices_voided++;
        logStep("Invoice voided successfully", { invoice_id: invoice.id });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logStep("Failed to process invoice", { invoice_id: invoice.id, error: errorMessage });
        
        failedInvoices.push({ ...invoice, error: errorMessage });
        report.invoices_failed++;
        report.errors.push(`Invoice ${invoice.id}: ${errorMessage}`);
      }
    }

    // 4. Handle paid invoices (register for manual refund)
    if (paidInvoices.length > 0) {
      const refundRecords = paidInvoices.map(invoice => ({
        invoice_id: invoice.id,
        teacher_id: invoice.teacher_id,
        student_id: invoice.student_id,
        amount: invoice.amount,
        reason: 'teacher_subscription_cancelled',
        stripe_payment_intent_id: invoice.stripe_payment_intent_id
      }));

      const { error: refundError } = await supabaseService
        .from('pending_refunds')
        .insert(refundRecords);

      if (refundError) {
        logStep("Failed to register refunds", { error: refundError.message });
        report.errors.push(`Failed to register refunds: ${refundError.message}`);
      } else {
        logStep("Registered paid invoices for manual refund", { count: paidInvoices.length });
        
        // Update paid invoices status
        await supabaseService
          .from('invoices')
          .update({ 
            status: 'paga_requer_estorno',
            updated_at: new Date().toISOString()
          })
          .in('id', paidInvoices.map(inv => inv.id));
      }
    }

    // 5. Send notifications
    if (Deno.env.get("RESEND_API_KEY")) {
      await sendNotifications(supabaseService, teacher_id, voidedInvoices, paidInvoices);
    }

    // 6. Write audit log
    report.processing_time_ms = Date.now() - startTime;
    
    await supabaseService.from('audit_logs').insert({
      actor_id: null, // System action
      target_teacher_id: teacher_id,
      table_name: 'invoices',
      record_id: teacher_id,
      operation: 'TEACHER_SUBSCRIPTION_CANCELLED',
      old_data: null,
      new_data: report
    });

    logStep("Processing completed", report);

    return new Response(JSON.stringify({
      success: true,
      report
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in teacher cancellation", { message: errorMessage });
    
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function sendNotifications(
  supabaseService: any,
  teacherId: string,
  voidedInvoices: any[],
  paidInvoices: any[]
) {
  try {
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    // Get teacher info
    const { data: teacher } = await supabaseService
      .from('profiles')
      .select('name, email')
      .eq('id', teacherId)
      .single();

    // Get affected students
    const studentIds = [...new Set([
      ...voidedInvoices.map(inv => inv.student_id),
      ...paidInvoices.map(inv => inv.student_id)
    ])];

    const { data: students } = await supabaseService
      .from('profiles')
      .select('name, email, guardian_email')
      .in('id', studentIds);

    // Send notification to teacher
    if (teacher?.email) {
      await resend.emails.send({
        from: "Sistema de Ensino <noreply@sistema.com>",
        to: [teacher.email],
        subject: "Cobranças automaticamente suspensas",
        html: `
          <h2>Olá ${teacher.name},</h2>
          <p>Sua assinatura foi alterada/cancelada e todas as cobranças ativas de seus alunos foram automaticamente suspensas.</p>
          <ul>
            <li><strong>Faturas canceladas:</strong> ${voidedInvoices.length}</li>
            <li><strong>Faturas que precisam estorno manual:</strong> ${paidInvoices.length}</li>
            <li><strong>Alunos afetados:</strong> ${studentIds.length}</li>
          </ul>
          <p>Para reativar as cobranças, renove sua assinatura com o módulo financeiro.</p>
        `,
      });
    }

    // Send notifications to students/guardians
    for (const student of students || []) {
      const emailTo = student.guardian_email || student.email;
      if (emailTo) {
        await resend.emails.send({
          from: "Sistema de Ensino <noreply@sistema.com>",
          to: [emailTo],
          subject: "Cobranças suspensas temporariamente",
          html: `
            <h2>Olá ${student.name},</h2>
            <p>Informamos que as cobranças mensais referentes às suas aulas foram automaticamente suspensas devido a alterações no plano de assinatura do seu professor.</p>
            <p><strong>Você NÃO será mais cobrado</strong> até que seu professor reative o serviço.</p>
            <p>Suas aulas continuam normalmente - apenas a cobrança foi suspensa.</p>
          `,
        });
      }
    }

    logStep("Notifications sent successfully");
  } catch (error) {
    logStep("Failed to send notifications", { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
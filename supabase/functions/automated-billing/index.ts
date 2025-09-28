import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[AUTOMATED-BILLING] ${step}${detailsStr}`);
};

interface StudentBillingInfo {
  student_id: string;
  teacher_id: string;
  billing_day: number;
  payment_due_days: number;
  student_name: string;
  teacher_name: string;
  business_profile_id: string;
  relationship_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep("Starting automated billing process");
    const today = new Date().getDate();

    // 1. Encontrar todos os relacionamentos professor-aluno que devem ser cobrados hoje
    const { data: relationshipsToBill, error: relationshipsError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select(`
        id,
        student_id,
        teacher_id,
        billing_day,
        business_profile_id,
        teacher:profiles!teacher_id (
          id,
          name,
          email,
          payment_due_days,
          user_subscriptions!inner (
            id,
            status,
            subscription_plans!inner (
              id,
              features
            )
          )
        ),
        student:profiles!student_id (
          id,
          name,
          email
        )
      `)
      .eq('billing_day', today);

    if (relationshipsError) {
      logStep("Error fetching relationships", relationshipsError);
      throw relationshipsError;
    }

    if (!relationshipsToBill || relationshipsToBill.length === 0) {
      logStep('No relationships to bill today');
      return new Response(JSON.stringify({ message: 'Nenhum relacionamento para cobrar hoje.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    logStep(`Found ${relationshipsToBill.length} relationships to bill today`);

    let processedCount = 0;
    let errorCount = 0;

    // Processar cada relacionamento
    for (const relationship of relationshipsToBill) {
      try {
        const teacher = Array.isArray(relationship.teacher) ? relationship.teacher[0] : relationship.teacher;
        const student = Array.isArray(relationship.student) ? relationship.student[0] : relationship.student;

        logStep(`Processing billing for: ${teacher?.name} -> ${student?.name}`);

        // Validar se o professor pode cobrar (tem assinatura ativa com módulo financeiro)
        const canBill = await validateTeacherCanBill(teacher);
        if (!canBill) {
          logStep(`Skipping ${teacher?.name} -> ${student?.name} - no financial module access`);
          continue;
        }

        // Validar se há business_profile_id definido
        if (!relationship.business_profile_id) {
          logStep(`Skipping student ${student?.name}: no business profile defined for payment routing`);
          continue;
        }

        const studentInfo: StudentBillingInfo = {
          student_id: relationship.student_id,
          teacher_id: relationship.teacher_id,
          billing_day: relationship.billing_day,
          payment_due_days: teacher?.payment_due_days || 15,
          student_name: student?.name || '',
          teacher_name: teacher?.name || '',
          business_profile_id: relationship.business_profile_id,
          relationship_id: relationship.id,
        };

        // 2. Encontrar todas as aulas concluídas e não faturadas para este relacionamento
        logStep(`Looking for completed classes for ${studentInfo.student_name} (teacher: ${studentInfo.teacher_name})`);
        
        const { data: classesToInvoice, error: classesError } = await supabaseAdmin
          .from('classes')
          .select(`
            id, 
            notes,
            service_id,
            class_date,
            status,
            class_services (
              id,
              name,
              price,
              description
            )
          `)
          .eq('student_id', studentInfo.student_id)
          .eq('teacher_id', studentInfo.teacher_id)
          .eq('status', 'concluida')
          .is('invoice_id', null);

        logStep(`Query result - Classes found: ${classesToInvoice?.length || 0}, Error: ${classesError ? JSON.stringify(classesError) : 'none'}`);

        if (classesError) {
          logStep(`Error fetching classes for ${studentInfo.student_name}`, classesError);
          errorCount++;
          continue;
        }

        if (!classesToInvoice || classesToInvoice.length === 0) {
          logStep(`No classes to invoice for ${studentInfo.student_name}`);
          continue;
        }

        logStep(`Found ${classesToInvoice.length} classes to invoice for ${studentInfo.student_name}`);

        // 3. Calcular valor total e criar fatura no banco
        let totalAmount = 0;
        for (const classItem of classesToInvoice) {
          const service = Array.isArray(classItem.class_services) ? classItem.class_services[0] : classItem.class_services;
          const amount = service?.price || 100; // Valor padrão se não houver serviço
          totalAmount += amount;
        }

        const now = new Date();
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + studentInfo.payment_due_days);

        // Criar fatura no banco de dados usando o mesmo padrão da função manual
        const invoiceData = {
          student_id: studentInfo.student_id,
          teacher_id: studentInfo.teacher_id,
          amount: totalAmount,
          description: `Faturamento automático - ${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pendente' as const,
          invoice_type: 'automated',
          business_profile_id: studentInfo.business_profile_id,
        };

        const { data: newInvoice, error: invoiceError } = await supabaseAdmin
          .from('invoices')
          .insert(invoiceData)
          .select()
          .single();

        if (invoiceError) {
          logStep(`Error creating invoice for ${studentInfo.student_name}`, invoiceError);
          errorCount++;
          continue;
        }

        logStep(`Invoice created in database`, { 
          invoiceId: newInvoice.id,
          amount: totalAmount,
          businessProfileId: studentInfo.business_profile_id 
        });

        // 4. Atualizar as aulas com o ID da nova fatura
        const classIds = classesToInvoice.map(c => c.id);
        const { error: updateClassesError } = await supabaseAdmin
          .from('classes')
          .update({ invoice_id: newInvoice.id })
          .in('id', classIds);

        if (updateClassesError) {
          logStep(`Warning: Could not update classes with invoice_id for ${studentInfo.student_name}`, updateClassesError);
        } else {
          logStep(`Classes updated with invoice_id`, { classIds });
        }

        // 5. Gerar URL de pagamento usando create-payment-intent-connect (mesmo fluxo da função manual)
        logStep(`Generating payment URL for invoice ${newInvoice.id}`);
        try {
          const { data: paymentResult, error: paymentError } = await supabaseAdmin.functions.invoke(
            'create-payment-intent-connect',
            {
              body: {
                invoice_id: newInvoice.id,
                payment_method: 'boleto' // Default to boleto for automated billing
              }
            }
          );

          if (!paymentError && paymentResult?.boleto_url) {
            // Atualizar fatura com URL de pagamento gerada
            const { error: updateError } = await supabaseAdmin
              .from('invoices')
              .update({ 
                stripe_hosted_invoice_url: paymentResult.boleto_url,
                boleto_url: paymentResult.boleto_url,
                linha_digitavel: paymentResult.linha_digitavel,
                stripe_payment_intent_id: paymentResult.payment_intent_id
              })
              .eq('id', newInvoice.id);

            if (!updateError) {
              logStep(`Payment URL generated and saved`, { 
                invoiceId: newInvoice.id,
                paymentUrl: paymentResult.boleto_url 
              });
            } else {
              logStep(`Warning: Could not update invoice with payment URL`, updateError);
            }
          } else {
            logStep(`Warning: Could not generate payment URL`, paymentError);
          }
        } catch (paymentGenerationError) {
          logStep(`Warning: Failed to generate payment URL`, paymentGenerationError);
          // Continue without failing the invoice creation
        }

        logStep(`Invoice ${newInvoice.id} created successfully for ${studentInfo.student_name}`);
        processedCount++;

      } catch (relationshipError) {
        logStep(`Error processing relationship:`, relationshipError);
        errorCount++;
        continue;
      }
    }

    const message = `Automated billing completed. Processed: ${processedCount}, Errors: ${errorCount}`;
    logStep("Billing process completed", { processedCount, errorCount });

    return new Response(JSON.stringify({ 
      success: true,
      message,
      processed_relationships: processedCount,
      error_count: errorCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    logStep('General error in billing function', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// Validation function to check if teacher can bill
async function validateTeacherCanBill(teacher: any): Promise<boolean> {
  try {
    // Check if teacher has active subscription
    if (!teacher.user_subscriptions || teacher.user_subscriptions.length === 0) {
      return false;
    }

    const subscription = teacher.user_subscriptions[0];
    
    // Check if subscription is active
    if (subscription.status !== 'active') {
      return false;
    }

    // Check if plan has financial module
    const hasFinancialModule = subscription.subscription_plans?.features?.financial_module === true;
    
    return hasFinancialModule;
  } catch (error) {
    console.error('Error validating teacher billing permissions:', error);
    return false;
  }
}
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
          payment_due_days
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
          .eq('status', 'concluida');

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

        // Filtrar aulas que ainda não foram faturadas
        const classIds = classesToInvoice.map(c => c.id);
        const { data: existingInvoices, error: invoicesError } = await supabaseAdmin
          .from('invoices')
          .select('class_id')
          .eq('student_id', studentInfo.student_id)
          .eq('teacher_id', studentInfo.teacher_id)
          .in('class_id', classIds);

        if (invoicesError) {
          logStep(`Error checking existing invoices for ${studentInfo.student_name}`, invoicesError);
          errorCount++;
          continue;
        }

        const invoicedClassIds = (existingInvoices || []).map(inv => inv.class_id);
        const unbilledClasses = classesToInvoice.filter(c => !invoicedClassIds.includes(c.id));

        if (unbilledClasses.length === 0) {
          logStep(`All classes already invoiced for ${studentInfo.student_name}`);
          continue;
        }

        logStep(`Found ${unbilledClasses.length} unbilled classes to invoice for ${studentInfo.student_name}`);

        // 3. Calcular valor total e criar fatura no banco
        let totalAmount = 0;
        for (const classItem of unbilledClasses) {
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

        // 4. Atualizar as faturas com referência às aulas (uma fatura por aula)
        for (const classItem of unbilledClasses) {
          const { error: updateInvoiceError } = await supabaseAdmin
            .from('invoices')
            .update({ class_id: classItem.id })
            .eq('id', newInvoice.id);

          if (updateInvoiceError) {
            logStep(`Warning: Could not link class ${classItem.id} to invoice`, updateInvoiceError);
          }
          
          // Para múltiplas aulas, criar uma fatura separada para cada uma após a primeira
          if (classItem !== unbilledClasses[0]) {
            const { data: additionalInvoice, error: additionalInvoiceError } = await supabaseAdmin
              .from('invoices')
              .insert({
                ...invoiceData,
                class_id: classItem.id,
                description: `${invoiceData.description} - Aula ${new Date(classItem.class_date).toLocaleDateString('pt-BR')}`
              })
              .select()
              .single();

            if (additionalInvoiceError) {
              logStep(`Warning: Could not create additional invoice for class ${classItem.id}`, additionalInvoiceError);
            } else {
              logStep(`Additional invoice created`, { invoiceId: additionalInvoice.id, classId: classItem.id });
            }
          }
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
    // Get teacher's subscription separately
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .select(`
        status,
        subscription_plans!inner (
          features
        )
      `)
      .eq('user_id', teacher.id)
      .eq('status', 'active')
      .maybeSingle();

    if (subError || !subscription) {
      return false;
    }

    // Check if plan has financial module - subscription_plans é um array
    const plan = Array.isArray(subscription.subscription_plans) 
      ? subscription.subscription_plans[0] 
      : subscription.subscription_plans;
    const hasFinancialModule = plan?.features?.financial_module === true;
    
    return hasFinancialModule;
  } catch (error) {
    console.error('Error validating teacher billing permissions:', error);
    return false;
  }
}
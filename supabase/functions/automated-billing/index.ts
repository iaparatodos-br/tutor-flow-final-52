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

        // Validar se o business_profile está ativo
        const { data: businessProfile, error: businessError } = await supabaseAdmin
          .from('business_profiles')
          .select('id, business_name')
          .eq('id', relationship.business_profile_id)
          .eq('user_id', relationship.teacher_id)
          .maybeSingle();

        if (businessError || !businessProfile) {
          logStep(`Skipping student ${student?.name}: business profile not found or not active`, businessError);
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
        logStep(`Looking for completed and unbilled classes for ${studentInfo.student_name} (teacher: ${studentInfo.teacher_name})`);
        
        // 2.0. ALERTA: Verificar aulas confirmadas antigas que não foram marcadas como concluídas
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: oldConfirmedClasses, error: oldClassesError } = await supabaseAdmin
          .from('classes')
          .select('id, class_date, status')
          .eq('student_id', studentInfo.student_id)
          .eq('teacher_id', studentInfo.teacher_id)
          .eq('status', 'confirmada')
          .lt('class_date', thirtyDaysAgo.toISOString());
        
        if (!oldClassesError && oldConfirmedClasses && oldConfirmedClasses.length > 0) {
          logStep(`⚠️ ALERTA: ${oldConfirmedClasses.length} aulas confirmadas com mais de 30 dias não foram marcadas como concluídas`, {
            student: studentInfo.student_name,
            teacher: studentInfo.teacher_name,
            oldClassCount: oldConfirmedClasses.length,
            oldestClass: oldConfirmedClasses[0]?.class_date
          });
        }
        
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
          .eq('billed', false);

        logStep(`Query result - Unbilled classes found: ${classesToInvoice?.length || 0}, Error: ${classesError ? JSON.stringify(classesError) : 'none'}`);

        if (classesError) {
          logStep(`Error fetching unbilled classes for ${studentInfo.student_name}`, classesError);
          errorCount++;
          continue;
        }

        // 2.1. Encontrar aulas canceladas com cobrança pendente (não faturadas)
        const { data: cancelledClassesWithCharge, error: cancelledError } = await supabaseAdmin
          .from('classes')
          .select(`
            id, 
            notes,
            service_id,
            class_date,
            status,
            cancellation_reason,
            cancelled_at,
            class_services (
              id,
              name,
              price,
              description
            )
          `)
          .eq('student_id', studentInfo.student_id)
          .eq('teacher_id', studentInfo.teacher_id)
          .eq('status', 'cancelada')
          .eq('charge_applied', true)
          .eq('billed', false);

        logStep(`Query result - Cancelled classes with charge: ${cancelledClassesWithCharge?.length || 0}, Error: ${cancelledError ? JSON.stringify(cancelledError) : 'none'}`);

        if (cancelledError) {
          logStep(`Error fetching cancelled classes with charge for ${studentInfo.student_name}`, cancelledError);
          // Continue without cancellation charges
        }

        // Consolidar aulas concluídas e canceladas com cobrança
        const unbilledClasses = classesToInvoice || [];
        const cancelledChargeable = cancelledClassesWithCharge || [];
        
        if (unbilledClasses.length === 0 && cancelledChargeable.length === 0) {
          logStep(`No unbilled classes or cancellation charges found for ${studentInfo.student_name}`);
          continue;
        }

        logStep(`Found ${unbilledClasses.length} unbilled classes and ${cancelledChargeable.length} cancellation charges to invoice for ${studentInfo.student_name}`);

        // 3. Calcular valor total e criar fatura e marcar classes como faturadas atomicamente
        let totalAmount = 0;
        let completedClassesCount = 0;
        let cancellationChargesCount = 0;
        
        // Buscar serviço padrão do professor caso alguma aula não tenha serviço associado
        let defaultServicePrice: number | null = null;
        const { data: defaultService } = await supabaseAdmin
          .from('class_services')
          .select('price')
          .eq('teacher_id', studentInfo.teacher_id)
          .eq('is_default', true)
          .eq('is_active', true)
          .maybeSingle();
        
        if (defaultService) {
          defaultServicePrice = defaultService.price;
        }
        
        // Somar aulas concluídas
        for (const classItem of unbilledClasses) {
          const service = Array.isArray(classItem.class_services) ? classItem.class_services[0] : classItem.class_services;
          const amount = service?.price || defaultServicePrice || 100; // Usar serviço padrão ou R$100 como último recurso
          totalAmount += amount;
          completedClassesCount++;
        }
        
        // Somar cobranças de cancelamento
        for (const cancelledClass of cancelledChargeable) {
          const service = Array.isArray(cancelledClass.class_services) ? cancelledClass.class_services[0] : cancelledClass.class_services;
          const baseAmount = service?.price || defaultServicePrice || 100; // Usar serviço padrão ou R$100 como último recurso
          
          // Buscar política de cancelamento para calcular porcentagem
          const { data: policy } = await supabaseAdmin
            .from('cancellation_policies')
            .select('charge_percentage')
            .eq('teacher_id', studentInfo.teacher_id)
            .eq('is_active', true)
            .maybeSingle();
          
          const chargePercentage = policy?.charge_percentage || 50;
          const chargeAmount = (baseAmount * chargePercentage) / 100;
          totalAmount += chargeAmount;
          cancellationChargesCount++;
        }

        logStep(`Total amount calculated`, { 
          totalAmount, 
          completedClassesCount, 
          cancellationChargesCount 
        });

        const now = new Date();
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + studentInfo.payment_due_days);

        // Consolidar IDs de todas as classes (concluídas + canceladas com cobrança)
        const classIds = [
          ...unbilledClasses.map(c => c.id),
          ...cancelledChargeable.map(c => c.id)
        ];
        
        // Criar descrição detalhada
        let descriptionParts = [];
        if (completedClassesCount > 0) {
          descriptionParts.push(`${completedClassesCount} aula${completedClassesCount > 1 ? 's' : ''}`);
        }
        if (cancellationChargesCount > 0) {
          descriptionParts.push(`${cancellationChargesCount} cancelamento${cancellationChargesCount > 1 ? 's' : ''}`);
        }
        const description = `Faturamento automático - ${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} (${descriptionParts.join(' + ')})`;

        const invoiceData = {
          student_id: studentInfo.student_id,
          teacher_id: studentInfo.teacher_id,
          amount: totalAmount,
          description: description,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pendente' as const,
          invoice_type: 'automated',
          business_profile_id: studentInfo.business_profile_id,
        };

        // Usar função atômica para criar fatura e marcar classes
        const { data: transactionResult, error: transactionError } = await supabaseAdmin
          .rpc('create_invoice_and_mark_classes_billed', {
            p_invoice_data: invoiceData,
            p_class_ids: classIds
          });

        if (transactionError || !transactionResult?.success) {
          logStep(`Error in atomic transaction for ${studentInfo.student_name}`, {
            error: transactionError,
            result: transactionResult
          });
          errorCount++;
          continue;
        }

        const invoiceId = transactionResult.invoice_id;
        logStep(`Invoice created atomically`, { 
          invoiceId,
          amount: totalAmount,
          businessProfileId: studentInfo.business_profile_id,
          classesMarked: transactionResult.classes_updated
        });

        // 4. Gerar URL de pagamento usando create-payment-intent-connect (mesmo fluxo da função manual)
        logStep(`Generating payment URL for invoice ${invoiceId}`);
        try {
          const { data: paymentResult, error: paymentError } = await supabaseAdmin.functions.invoke(
            'create-payment-intent-connect',
            {
              body: {
                invoice_id: invoiceId,
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
              .eq('id', invoiceId);

            if (!updateError) {
              logStep(`Payment URL generated and saved`, { 
                invoiceId,
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

        logStep(`Invoice ${invoiceId} created successfully for ${studentInfo.student_name}`);
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
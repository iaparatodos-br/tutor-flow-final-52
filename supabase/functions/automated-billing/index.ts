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

interface UnbilledParticipant {
  participant_id: string;
  class_id: string;
  student_id: string;
  dependent_id: string | null;
  dependent_name: string | null;
  responsible_id: string | null;
  class_date: string;
  service_id: string | null;
  charge_applied: boolean | null;
  class_services: {
    id: string;
    name: string;
    price: number;
    description: string | null;
  } | null;
}

// Interface for active subscription from RPC
interface ActiveSubscription {
  subscription_id: string;
  subscription_name: string;
  price: number;
  max_classes: number | null;
  overage_price: number | null;
  starts_at: string;
  student_subscription_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep("Starting automated billing process");
    const today = new Date().getDate();

    // 1. Encontrar todos os relacionamentos professor-aluno que devem ser cobrados hoje
    // Sequential queries to avoid FK join syntax (Etapa 0.6)
    const { data: relationshipsRaw, error: relationshipsError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select('id, student_id, teacher_id, billing_day, business_profile_id')
      .eq('billing_day', today);

    if (relationshipsError) {
      logStep("Error fetching relationships", relationshipsError);
      throw relationshipsError;
    }

    // Enrich with teacher and student profiles sequentially
    const relationshipsToBill: any[] = [];
    if (relationshipsRaw && relationshipsRaw.length > 0) {
      const teacherIds = [...new Set(relationshipsRaw.map(r => r.teacher_id))];
      const studentIds = [...new Set(relationshipsRaw.map(r => r.student_id))];

      const { data: teachers } = await supabaseAdmin
        .from('profiles')
        .select('id, name, email, payment_due_days')
        .in('id', teacherIds);

      const { data: students } = await supabaseAdmin
        .from('profiles')
        .select('id, name, email')
        .in('id', studentIds);

      const teacherMap = new Map((teachers || []).map(t => [t.id, t]));
      const studentMap = new Map((students || []).map(s => [s.id, s]));

      for (const rel of relationshipsRaw) {
        relationshipsToBill.push({
          ...rel,
          teacher: teacherMap.get(rel.teacher_id) || null,
          student: studentMap.get(rel.student_id) || null,
        });
      }
    }

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

        // ===== FASE 6: VERIFICAR MENSALIDADE ATIVA (Tarefas 6.1-6.5) =====
        // IMPORTANTE: A RPC retorna um ARRAY (RETURNS TABLE), não um objeto único
        const { data: activeSubscriptionData, error: subError } = await supabaseAdmin
          .rpc('get_student_active_subscription', {
            p_relationship_id: studentInfo.relationship_id
          }) as { data: ActiveSubscription[] | null, error: any };

        if (subError) {
          logStep(`Error checking active subscription for ${studentInfo.student_name}`, subError);
          // Continue with traditional billing
        }

        // Extrair primeiro elemento do array (se existir)
        const activeSubscription = activeSubscriptionData && activeSubscriptionData.length > 0 
          ? activeSubscriptionData[0] 
          : null;

        const hasActiveSubscription = activeSubscription && activeSubscription.subscription_id;
        
        if (hasActiveSubscription) {
          logStep(`📦 Active monthly subscription found for ${studentInfo.student_name}`, {
            subscriptionName: activeSubscription.subscription_name,
            price: activeSubscription.price,
            maxClasses: activeSubscription.max_classes,
            overagePrice: activeSubscription.overage_price,
            startsAt: activeSubscription.starts_at
          });

          // Processar faturamento de mensalidade
          const subscriptionResult = await processMonthlySubscriptionBilling(
            studentInfo,
            activeSubscription
          );

          if (subscriptionResult.success) {
            processedCount++;
            logStep(`✅ Monthly subscription billing completed for ${studentInfo.student_name}`, subscriptionResult);
          } else {
            errorCount++;
            logStep(`❌ Monthly subscription billing failed for ${studentInfo.student_name}`, subscriptionResult.error);
          }

          // Continuar para próximo relacionamento - mensalidade processa separadamente
          continue;
        }

        // ===== FLUXO TRADICIONAL (SEM MENSALIDADE) =====
        logStep(`📚 No active subscription - using traditional per-class billing for ${studentInfo.student_name}`);

        // 2. Encontrar todas as aulas concluídas e não faturadas usando get_unbilled_participants_v2
        // Esta versão inclui dependentes e retorna o responsible_id para consolidação
        logStep(`Looking for completed and unbilled classes for ${studentInfo.student_name} (teacher: ${studentInfo.teacher_name}) including dependents`);
        
        // 2.0. ALERTA: Verificar aulas confirmadas antigas que não foram marcadas como concluídas
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Sequential queries to avoid FK join (Etapa 0.6)
        // First get participant IDs, then filter by class data
        const { data: confirmedParticipations, error: cpError } = await supabaseAdmin
          .from('class_participants')
          .select('id, class_id')
          .eq('student_id', studentInfo.student_id)
          .eq('status', 'confirmada');

        let oldConfirmedParticipations: any[] = [];
        let oldClassesError = cpError;
        if (!cpError && confirmedParticipations && confirmedParticipations.length > 0) {
          const classIds = confirmedParticipations.map(p => p.class_id);
          const { data: oldClasses } = await supabaseAdmin
            .from('classes')
            .select('id, class_date, status, teacher_id')
            .in('id', classIds)
            .eq('teacher_id', studentInfo.teacher_id)
            .lt('class_date', thirtyDaysAgo.toISOString());
          
          const oldClassIds = new Set((oldClasses || []).map(c => c.id));
          oldConfirmedParticipations = confirmedParticipations
            .filter(p => oldClassIds.has(p.class_id))
            .map(p => ({ ...p, classes: oldClasses?.find(c => c.id === p.class_id) }));
        }
        
        if (!oldClassesError && oldConfirmedParticipations && oldConfirmedParticipations.length > 0) {
          logStep(`⚠️ ALERTA: ${oldConfirmedParticipations.length} aulas confirmadas com mais de 30 dias não foram marcadas como concluídas`, {
            student: studentInfo.student_name,
            teacher: studentInfo.teacher_name,
            oldClassCount: oldConfirmedParticipations.length,
            oldestClass: oldConfirmedParticipations[0]?.classes?.class_date
          });
        }
        
        // NOVA LÓGICA: Usar get_unbilled_participants_v2 que inclui dependentes
        // Esta RPC retorna tanto participações do aluno quanto de seus dependentes
        const { data: completedParticipations, error: classesError } = await supabaseAdmin
          .rpc('get_unbilled_participants_v2', {
            p_teacher_id: studentInfo.teacher_id,
            p_student_id: studentInfo.student_id,
            p_status: 'concluida'
          }) as { data: UnbilledParticipant[] | null, error: any };
        
        logStep(`Query result - Unbilled participations (including dependents): ${completedParticipations?.length || 0}, Error: ${classesError ? JSON.stringify(classesError) : 'none'}`);

        // Contabilizar dependentes encontrados
        const dependentParticipations = completedParticipations?.filter(p => p.dependent_id !== null) || [];
        if (dependentParticipations.length > 0) {
          const dependentNames = [...new Set(dependentParticipations.map(p => p.dependent_name))];
          logStep(`Found ${dependentParticipations.length} unbilled participations for dependents: ${dependentNames.join(', ')}`);
        }

        // Transform to match expected structure, mantendo dependent_id e dependent_name
        const classesToInvoice = completedParticipations?.map(cp => ({
          id: cp.class_id,
          participant_id: cp.participant_id,
          class_date: cp.class_date,
          service_id: cp.service_id,
          teacher_id: studentInfo.teacher_id,
          class_services: cp.class_services,
          dependent_id: cp.dependent_id,
          dependent_name: cp.dependent_name
        })) || [];

        if (classesError) {
          logStep(`Error fetching unbilled classes for ${studentInfo.student_name}`, classesError);
          errorCount++;
          continue;
        }

        // 2.1. Encontrar cancelamentos com cobrança pendente usando get_unbilled_participants_v2
        const { data: cancelledParticipations, error: cancelledError } = await supabaseAdmin
          .rpc('get_unbilled_participants_v2', {
            p_teacher_id: studentInfo.teacher_id,
            p_student_id: studentInfo.student_id,
            p_status: 'cancelada'
          }) as { data: UnbilledParticipant[] | null, error: any };
        
        // Filtrar apenas os que têm charge_applied
        const cancelledClassesWithCharge = (cancelledParticipations || [])
          .filter(cp => cp.charge_applied)
          .map(cp => ({
            id: cp.class_id,
            participant_id: cp.participant_id,
            class_date: cp.class_date,
            service_id: cp.service_id,
            teacher_id: studentInfo.teacher_id,
            class_services: cp.class_services,
            is_cancellation_charge: true,
            dependent_id: cp.dependent_id,
            dependent_name: cp.dependent_name
          }));

        logStep(`Query result - Cancelled with charge (including dependents): ${cancelledClassesWithCharge?.length || 0}, Error: ${cancelledError ? JSON.stringify(cancelledError) : 'none'}`);

        if (cancelledError) {
          logStep(`Error fetching cancelled classes with charge for ${studentInfo.student_name}`, cancelledError);
          // Continue without cancellation charges
        }

        // Consolidar participações concluídas e canceladas com cobrança
        const unbilledClasses = classesToInvoice;
        const cancelledChargeable = cancelledClassesWithCharge;
        
        if (unbilledClasses.length === 0 && cancelledChargeable.length === 0) {
          logStep(`No unbilled classes or cancellation charges found for ${studentInfo.student_name}`);
          continue;
        }

        logStep(`Found ${unbilledClasses.length} unbilled participations and ${cancelledChargeable.length} cancellation charges to invoice for ${studentInfo.student_name}`);

        // 3. Calcular valor total e criar fatura e marcar classes como faturadas atomicamente
        let totalAmount = 0;
        let completedClassesCount = 0;
        let cancellationChargesCount = 0;
        let dependentClassesCount = 0;
        
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
          const service = classItem.class_services;
          const amount = service?.price || defaultServicePrice || 100; // Usar serviço padrão ou R$100 como último recurso
          totalAmount += amount;
          completedClassesCount++;
          if (classItem.dependent_id) {
            dependentClassesCount++;
          }
        }
        
        // Somar cobranças de cancelamento
        for (const cancelledClass of cancelledChargeable) {
          const service = cancelledClass.class_services;
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
          if (cancelledClass.dependent_id) {
            dependentClassesCount++;
          }
        }

        logStep(`Total amount calculated`, { 
          totalAmount, 
          completedClassesCount, 
          cancellationChargesCount,
          dependentClassesCount 
        });

        // Validate minimum boleto amount (Stripe requirement: R$ 5.00)
        const MINIMUM_BOLETO_AMOUNT = 5.00;
        const skipBoletoGeneration = totalAmount < MINIMUM_BOLETO_AMOUNT;
        const now = new Date();
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + studentInfo.payment_due_days);

        // Preparar itens detalhados para invoice_classes com dependent_id para auditoria
        const invoiceItems = [];

        // Adicionar aulas concluídas
        for (const classItem of unbilledClasses) {
          const service = classItem.class_services;
          const amount = service?.price || defaultServicePrice || 100;
          
          // Descrição inclui nome do dependente se aplicável
          let description = `Aula de ${service?.name || 'serviço padrão'} - ${new Date(classItem.class_date).toLocaleDateString('pt-BR')}`;
          if (classItem.dependent_name) {
            description = `[${classItem.dependent_name}] ${description}`;
          }
          
          invoiceItems.push({
            class_id: classItem.id,
            participant_id: classItem.participant_id,
            item_type: 'completed_class',
            amount: amount,
            description: description,
            cancellation_policy_id: null,
            charge_percentage: null,
            dependent_id: classItem.dependent_id // Para auditoria
          });
        }

        // Adicionar cobranças de cancelamento
        for (const cancelledClass of cancelledChargeable) {
          const service = cancelledClass.class_services;
          const baseAmount = service?.price || defaultServicePrice || 100;
          
          // Buscar política de cancelamento
          const { data: policy } = await supabaseAdmin
            .from('cancellation_policies')
            .select('id, charge_percentage')
            .eq('teacher_id', studentInfo.teacher_id)
            .eq('is_active', true)
            .maybeSingle();
          
          const chargePercentage = policy?.charge_percentage || 50;
          const chargeAmount = (baseAmount * chargePercentage) / 100;
          
          // Descrição inclui nome do dependente se aplicável
          let description = `Cancelamento - ${service?.name || 'serviço padrão'} (${chargePercentage}%)`;
          if (cancelledClass.dependent_name) {
            description = `[${cancelledClass.dependent_name}] ${description}`;
          }
          
          invoiceItems.push({
            class_id: cancelledClass.id,
            participant_id: cancelledClass.participant_id,
            item_type: 'cancellation_charge',
            amount: chargeAmount,
            description: description,
            cancellation_policy_id: policy?.id || null,
            charge_percentage: chargePercentage,
            dependent_id: cancelledClass.dependent_id // Para auditoria
          });
        }
        
        // Criar descrição detalhada incluindo dependentes
        let descriptionParts = [];
        if (completedClassesCount > 0) {
          descriptionParts.push(`${completedClassesCount} aula${completedClassesCount > 1 ? 's' : ''}`);
        }
        if (cancellationChargesCount > 0) {
          descriptionParts.push(`${cancellationChargesCount} cancelamento${cancellationChargesCount > 1 ? 's' : ''}`);
        }
        
        let description = `Faturamento automático - ${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} (${descriptionParts.join(' + ')})`;
        
        // Adicionar nota sobre dependentes se houver
        if (dependentClassesCount > 0) {
          const dependentNames = [...new Set([
            ...unbilledClasses.filter(c => c.dependent_name).map(c => c.dependent_name),
            ...cancelledChargeable.filter(c => c.dependent_name).map(c => c.dependent_name)
          ])];
          if (dependentNames.length > 0) {
            description += ` - Inclui aulas de: ${dependentNames.join(', ')}`;
          }
        }

        // Adicionar nota se valor abaixo do mínimo para boleto
        if (skipBoletoGeneration) {
          description += ` [Valor abaixo do mínimo R$ ${MINIMUM_BOLETO_AMOUNT.toFixed(2).replace('.', ',')} - sem boleto gerado]`;
          logStep(`Invoice amount ${totalAmount} is below minimum ${MINIMUM_BOLETO_AMOUNT} for boleto - will skip boleto generation`, {
            student: studentInfo.student_name,
            amount: totalAmount
          });
        }

        const invoiceData = {
          student_id: studentInfo.student_id, // Responsável recebe a fatura
          teacher_id: studentInfo.teacher_id,
          amount: totalAmount,
          description: description,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pendente' as const,
          invoice_type: 'automated',
          business_profile_id: studentInfo.business_profile_id,
        };

        // Usar função atômica para criar fatura e marcar classes (agora com itens detalhados)
        const { data: transactionResult, error: transactionError } = await supabaseAdmin
          .rpc('create_invoice_and_mark_classes_billed', {
            p_invoice_data: invoiceData,
            p_class_items: invoiceItems
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
        
        logStep(`Invoice created atomically with invoice_classes`, { 
          invoiceId,
          amount: totalAmount,
          businessProfileId: studentInfo.business_profile_id,
          itemsCreated: transactionResult.items_created,
          classesMarked: transactionResult.classes_updated,
          participantsMarked: transactionResult.participants_updated,
          dependentItemsIncluded: dependentClassesCount
        });

        // 4. Gerar URL de pagamento usando create-payment-intent-connect (mesmo fluxo da função manual)
        // PULAR se valor abaixo do mínimo para boleto
        if (skipBoletoGeneration) {
          logStep(`Skipping boleto generation for invoice ${invoiceId} - amount ${totalAmount} below minimum ${MINIMUM_BOLETO_AMOUNT}`, {
            invoiceId,
            amount: totalAmount,
            student: studentInfo.student_name
          });
        } else {
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
        }

        logStep(`Invoice ${invoiceId} created successfully for ${studentInfo.student_name}`, {
          totalItems: completedClassesCount + cancellationChargesCount,
          dependentItems: dependentClassesCount,
          boletoSkipped: skipBoletoGeneration
        });
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
    // Return 200 to prevent cron job retry storms
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});

// ===== HELPER: Calcular datas do ciclo de faturamento baseado em billing_day =====
// IMPORTANTE: No dia de faturamento, queremos fechar o ciclo que ACABOU, não o ciclo que começa
function getBillingCycleDates(billingDay: number, referenceDate: Date = new Date()): { cycleStart: Date; cycleEnd: Date } {
  const currentDay = referenceDate.getDate();
  const currentMonth = referenceDate.getMonth();
  const currentYear = referenceDate.getFullYear();

  // Helper para ajustar dia para meses com menos dias
  const adjustDayForMonth = (year: number, month: number, targetDay: number): number => {
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    return Math.min(targetDay, lastDayOfMonth);
  };

  let cycleStart: Date;
  let cycleEnd: Date;

  // No dia de faturamento (currentDay == billingDay), queremos FECHAR o ciclo anterior
  // Exemplo: billing_day=7, hoje=07/01/2026
  // Ciclo a faturar: 07/12/2025 a 06/01/2026 (o ciclo que terminou ontem)
  
  if (currentDay > billingDay) {
    // Estamos APÓS o billing_day deste mês, então o ciclo atual começou este mês
    // Este caso NÃO deveria acontecer para faturamento automático (que roda no billing_day exato)
    // Mas manteremos para casos de execução manual atrasada
    const adjustedStartDay = adjustDayForMonth(currentYear, currentMonth, billingDay);
    cycleStart = new Date(currentYear, currentMonth, adjustedStartDay);
    
    const nextMonth = currentMonth + 1;
    const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
    const normalizedNextMonth = nextMonth > 11 ? 0 : nextMonth;
    const adjustedEndDay = adjustDayForMonth(nextYear, normalizedNextMonth, billingDay);
    cycleEnd = new Date(nextYear, normalizedNextMonth, adjustedEndDay);
    cycleEnd.setDate(cycleEnd.getDate() - 1);
  } else {
    // currentDay <= billingDay: Fechar ciclo ANTERIOR (mês passado até ontem)
    // Ciclo começou no mês anterior no billing_day
    const prevMonth = currentMonth - 1;
    const prevYear = prevMonth < 0 ? currentYear - 1 : currentYear;
    const normalizedPrevMonth = prevMonth < 0 ? 11 : prevMonth;
    const adjustedStartDay = adjustDayForMonth(prevYear, normalizedPrevMonth, billingDay);
    cycleStart = new Date(prevYear, normalizedPrevMonth, adjustedStartDay);
    
    // Fim do ciclo é um dia ANTES do billing_day deste mês
    const adjustedEndDay = adjustDayForMonth(currentYear, currentMonth, billingDay);
    cycleEnd = new Date(currentYear, currentMonth, adjustedEndDay);
    cycleEnd.setDate(cycleEnd.getDate() - 1); // Um dia antes (dia 6 se billing_day=7)
  }

  return { cycleStart, cycleEnd };
}

// ===== NOVA FUNÇÃO: Processar faturamento de mensalidade (Tarefas 6.1-6.5) =====
async function processMonthlySubscriptionBilling(
  studentInfo: StudentBillingInfo,
  subscription: ActiveSubscription
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  try {
    const now = new Date();
    const startsAt = new Date(subscription.starts_at);
    const MINIMUM_BOLETO_AMOUNT = 5.00;

    // ===== CALCULAR CICLO DE FATURAMENTO BASEADO EM BILLING_DAY =====
    const { cycleStart, cycleEnd } = getBillingCycleDates(studentInfo.billing_day, now);
    
    // Formatar datas para exibição
    const cycleStartStr = cycleStart.toLocaleDateString('pt-BR');
    const cycleEndStr = cycleEnd.toLocaleDateString('pt-BR');
    
    logStep(`📅 Billing cycle calculated based on billing_day=${studentInfo.billing_day}`, {
      cycleStart: cycleStart.toISOString().split('T')[0],
      cycleEnd: cycleEnd.toISOString().split('T')[0],
      startsAt: startsAt.toISOString().split('T')[0]
    });

    // Buscar aulas concluídas do período
    const { data: completedParticipations, error: classesError } = await supabaseAdmin
      .rpc('get_unbilled_participants_v2', {
        p_teacher_id: studentInfo.teacher_id,
        p_student_id: studentInfo.student_id,
        p_status: 'concluida'
      }) as { data: UnbilledParticipant[] | null, error: any };

    if (classesError) {
      return { success: false, error: `Error fetching classes: ${classesError.message}` };
    }

    const allClasses = completedParticipations || [];
    
    // DEBUG: Log do retorno da RPC
    logStep(`🔍 RPC returned classes`, {
      count: allClasses.length,
      teacher_id: studentInfo.teacher_id,
      student_id: studentInfo.student_id,
      firstClassDate: allClasses[0]?.class_date || 'none',
      lastClassDate: allClasses[allClasses.length - 1]?.class_date || 'none'
    });
    // ===== FILTRAR AULAS PELO CICLO DE FATURAMENTO =====
    // Usar o maior entre cycleStart e startsAt para primeiro mês do aluno
    const effectiveCycleStart = startsAt > cycleStart ? startsAt : cycleStart;
    
    // Helper para normalizar data (remover horário para comparação correta)
    const normalizeDate = (date: Date): number => {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    };
    
    const effectiveStartNorm = normalizeDate(effectiveCycleStart);
    const cycleEndNorm = normalizeDate(cycleEnd);
    
    // Aulas DENTRO do ciclo de faturamento (após effectiveCycleStart e até cycleEnd)
    const classesInBillingCycle = allClasses.filter(c => {
      const classDateNorm = normalizeDate(new Date(c.class_date));
      return classDateNorm >= effectiveStartNorm && classDateNorm <= cycleEndNorm;
    });
    
    // Aulas FORA do ciclo (antes do effectiveCycleStart) = cobrança avulsa tradicional
    const classesOutsideCycle = allClasses.filter(c => {
      const classDateNorm = normalizeDate(new Date(c.class_date));
      return classDateNorm < effectiveStartNorm;
    });

    logStep(`📊 Classes filtered by billing cycle (${cycleStartStr} - ${cycleEndStr})`, {
      effectiveCycleStart: effectiveCycleStart.toISOString().split('T')[0],
      inCycle: classesInBillingCycle.length,
      outsideCycle: classesOutsideCycle.length,
      total: allClasses.length
    });

    // Se há aulas fora do ciclo, registrar alerta
    if (classesOutsideCycle.length > 0) {
      logStep(`⚠️ ${classesOutsideCycle.length} classes outside billing cycle will be billed separately (traditional per-class)`);
    }

    // Calcular itens da fatura de mensalidade
    const invoiceItems: any[] = [];
    let totalAmount = 0;

    // Item 1: Valor base da mensalidade (Tarefa 6.3)
    invoiceItems.push({
      class_id: null,
      participant_id: null,
      item_type: 'monthly_base',
      amount: subscription.price,
      description: `Mensalidade ${subscription.subscription_name} - Ciclo ${cycleStartStr} a ${cycleEndStr}`,
      cancellation_policy_id: null,
      charge_percentage: null,
      dependent_id: null
    });
    totalAmount += subscription.price;

    // Item 2: Calcular excedentes baseado em aulas NO CICLO (Tarefa 6.4)
    const classesUsed = classesInBillingCycle.length;
    const maxClasses = subscription.max_classes;
    const overagePrice = subscription.overage_price;
    let overageCount = 0;
    let overageTotal = 0;

    if (maxClasses !== null && classesUsed > maxClasses && overagePrice !== null && overagePrice > 0) {
      overageCount = classesUsed - maxClasses;
      overageTotal = overageCount * overagePrice;
      
      invoiceItems.push({
        class_id: null,
        participant_id: null,
        item_type: 'overage',
        amount: overageTotal,
        description: `Excedente: ${overageCount} aula${overageCount > 1 ? 's' : ''} além do limite (${maxClasses}) - R$ ${overagePrice.toFixed(2).replace('.', ',')} cada`,
        cancellation_policy_id: null,
        charge_percentage: null,
        dependent_id: null
      });
      totalAmount += overageTotal;
      
      logStep(`📈 Overage calculated for billing cycle`, {
        maxClasses,
        classesUsed,
        overageCount,
        overagePrice,
        overageTotal,
        cycle: `${cycleStartStr} - ${cycleEndStr}`
      });
    }

    // Verificar mínimo para boleto
    const skipBoletoGeneration = totalAmount < MINIMUM_BOLETO_AMOUNT;

    // Criar descrição da fatura com período do ciclo
    let description = `Mensalidade ${subscription.subscription_name} - Ciclo ${cycleStartStr} a ${cycleEndStr}`;
    if (maxClasses !== null) {
      description += ` (${classesUsed}/${maxClasses} aulas)`;
    }
    if (overageCount > 0) {
      description += ` + ${overageCount} excedente${overageCount > 1 ? 's' : ''}`;
    }
    if (skipBoletoGeneration) {
      description += ` [Valor abaixo do mínimo R$ ${MINIMUM_BOLETO_AMOUNT.toFixed(2).replace('.', ',')} - sem boleto gerado]`;
    }

    // Calcular data de vencimento
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + studentInfo.payment_due_days);

    // Dados da fatura com invoice_type = 'monthly_subscription' (Tarefa 6.3) e monthly_subscription_id (Tarefa 6.5)
    const invoiceData = {
      student_id: studentInfo.student_id,
      teacher_id: studentInfo.teacher_id,
      amount: totalAmount,
      description: description,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'pendente',
      invoice_type: 'monthly_subscription', // Tarefa 6.3
      business_profile_id: studentInfo.business_profile_id,
      monthly_subscription_id: subscription.subscription_id // Tarefa 6.5
    };

    // Criar fatura usando RPC (adapta-se a itens com class_id/participant_id NULL - Tarefa 6.9)
    const { data: transactionResult, error: transactionError } = await supabaseAdmin
      .rpc('create_invoice_and_mark_classes_billed', {
        p_invoice_data: invoiceData,
        p_class_items: invoiceItems
      });

    if (transactionError || !transactionResult?.success) {
      return { 
        success: false, 
        error: transactionError?.message || transactionResult?.error || 'Transaction failed' 
      };
    }

    const invoiceId = transactionResult.invoice_id;

    // Atualizar fatura com monthly_subscription_id (a RPC pode não suportar este campo)
    await supabaseAdmin
      .from('invoices')
      .update({ monthly_subscription_id: subscription.subscription_id })
      .eq('id', invoiceId);

    logStep(`📦 Monthly subscription invoice created`, {
      invoiceId,
      subscriptionName: subscription.subscription_name,
      basePrice: subscription.price,
      classesUsed,
      maxClasses,
      overageCount,
      overageTotal,
      totalAmount
    });

    // Gerar boleto se valor >= mínimo
    if (!skipBoletoGeneration) {
      try {
        const { data: paymentResult, error: paymentError } = await supabaseAdmin.functions.invoke(
          'create-payment-intent-connect',
          {
            body: {
              invoice_id: invoiceId,
              payment_method: 'boleto'
            }
          }
        );

        if (!paymentError && paymentResult?.boleto_url) {
          await supabaseAdmin
            .from('invoices')
            .update({
              stripe_hosted_invoice_url: paymentResult.boleto_url,
              boleto_url: paymentResult.boleto_url,
              linha_digitavel: paymentResult.linha_digitavel,
              stripe_payment_intent_id: paymentResult.payment_intent_id
            })
            .eq('id', invoiceId);

          logStep(`💳 Boleto generated for monthly subscription invoice`, {
            invoiceId,
            boletoUrl: paymentResult.boleto_url
          });
        }
      } catch (paymentError) {
        logStep(`⚠️ Failed to generate boleto for monthly subscription`, paymentError);
        // Continue without failing
      }
    }

    // Enviar notificação de fatura
    try {
      await supabaseAdmin.functions.invoke('send-invoice-notification', {
        body: {
          invoice_id: invoiceId,
          notification_type: 'invoice_created'
        }
      });
      logStep(`📧 Invoice notification sent for monthly subscription`, { invoiceId });
    } catch (notifError) {
      logStep(`⚠️ Failed to send notification`, notifError);
    }

    // ===== PROCESSAR AULAS FORA DO CICLO (ANTES de starts_at) =====
    // Estas aulas devem ser cobradas como faturamento tradicional (por aula)
    let outsideCycleInvoiceId: string | null = null;
    
    if (classesOutsideCycle.length > 0) {
      logStep(`📦 Processing ${classesOutsideCycle.length} classes outside billing cycle as traditional per-class billing`);
      
      // Calcular itens para fatura tradicional
      const traditionalItems: any[] = [];
      let traditionalTotal = 0;
      
      for (const classInfo of classesOutsideCycle) {
        const servicePrice = classInfo.class_services?.price || 0;
        if (servicePrice > 0) {
          traditionalTotal += servicePrice;
          traditionalItems.push({
            class_id: classInfo.class_id,
            participant_id: classInfo.participant_id,
            item_type: 'completed_class',
            amount: servicePrice,
            description: `Aula avulsa (anterior à mensalidade) - ${classInfo.class_services?.name || 'Serviço'} - ${new Date(classInfo.class_date).toLocaleDateString('pt-BR')}`,
            cancellation_policy_id: null,
            charge_percentage: null,
            dependent_id: classInfo.dependent_id || null
          });
        }
      }
      
      // Criar fatura tradicional se houver valor
      if (traditionalTotal > 0 && traditionalItems.length > 0) {
        const skipTraditionalBoleto = traditionalTotal < MINIMUM_BOLETO_AMOUNT;
        
        let traditionalDescription = `Aulas avulsas anteriores à mensalidade - ${traditionalItems.length} aula${traditionalItems.length > 1 ? 's' : ''}`;
        if (skipTraditionalBoleto) {
          traditionalDescription += ` [Valor abaixo do mínimo R$ ${MINIMUM_BOLETO_AMOUNT.toFixed(2).replace('.', ',')} - sem boleto gerado]`;
        }
        
        const traditionalInvoiceData = {
          student_id: studentInfo.student_id,
          teacher_id: studentInfo.teacher_id,
          amount: traditionalTotal,
          description: traditionalDescription,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pendente',
          invoice_type: 'automated', // Fatura tradicional
          business_profile_id: studentInfo.business_profile_id,
          monthly_subscription_id: null // Não vinculada à mensalidade
        };
        
        const { data: traditionalResult, error: traditionalError } = await supabaseAdmin
          .rpc('create_invoice_and_mark_classes_billed', {
            p_invoice_data: traditionalInvoiceData,
            p_class_items: traditionalItems
          });
        
        if (traditionalError || !traditionalResult?.success) {
          logStep(`⚠️ Failed to create traditional invoice for classes outside cycle`, {
            error: traditionalError?.message || traditionalResult?.error
          });
        } else {
          outsideCycleInvoiceId = traditionalResult.invoice_id;
          logStep(`📦 Traditional invoice created for classes outside billing cycle`, {
            invoiceId: outsideCycleInvoiceId,
            classCount: traditionalItems.length,
            totalAmount: traditionalTotal
          });
          
          // Gerar boleto para fatura tradicional se valor >= mínimo
          if (!skipTraditionalBoleto) {
            try {
              const { data: paymentResult, error: paymentError } = await supabaseAdmin.functions.invoke(
                'create-payment-intent-connect',
                {
                  body: {
                    invoice_id: outsideCycleInvoiceId,
                    payment_method: 'boleto'
                  }
                }
              );

              if (!paymentError && paymentResult?.boleto_url) {
                await supabaseAdmin
                  .from('invoices')
                  .update({
                    stripe_hosted_invoice_url: paymentResult.boleto_url,
                    boleto_url: paymentResult.boleto_url,
                    linha_digitavel: paymentResult.linha_digitavel,
                    stripe_payment_intent_id: paymentResult.payment_intent_id
                  })
                  .eq('id', outsideCycleInvoiceId);

                logStep(`💳 Boleto generated for traditional invoice (outside cycle)`, {
                  invoiceId: outsideCycleInvoiceId,
                  boletoUrl: paymentResult.boleto_url
                });
              }
            } catch (paymentError) {
              logStep(`⚠️ Failed to generate boleto for traditional invoice`, paymentError);
            }
          }
          
          // Enviar notificação para fatura tradicional
          try {
            await supabaseAdmin.functions.invoke('send-invoice-notification', {
              body: {
                invoice_id: outsideCycleInvoiceId,
                notification_type: 'invoice_created'
              }
            });
            logStep(`📧 Invoice notification sent for traditional invoice (outside cycle)`, { invoiceId: outsideCycleInvoiceId });
          } catch (notifError) {
            logStep(`⚠️ Failed to send notification for traditional invoice`, notifError);
          }
        }
      }
    }

    return { 
      success: true, 
      invoiceId,
      outsideCycleInvoiceId // Retornar também o ID da fatura de aulas fora do ciclo
    };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Validation function to check if teacher can bill
async function validateTeacherCanBill(teacher: any): Promise<boolean> {
  try {
    // Get teacher's subscription separately
    // Sequential queries to avoid FK join (Etapa 0.6)
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('status, plan_id')
      .eq('user_id', teacher.id)
      .eq('status', 'active')
      .maybeSingle();

    if (subError || !subscription) {
      return false;
    }

    const hasFinancialModule = plan?.features?.financial_module === true;
    
    return hasFinancialModule;
  } catch (error) {
    console.error('Error validating teacher billing permissions:', error);
    return false;
  }
}

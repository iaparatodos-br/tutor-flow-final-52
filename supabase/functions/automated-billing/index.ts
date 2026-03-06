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
  teacher_timezone: string;
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

interface ActiveSubscription {
  subscription_id: string;
  subscription_name: string;
  price: number;
  starts_at: string;
  student_subscription_id: string;
}

// ===== HELPER: Get "today" date string in a given timezone using Intl =====
function getTodayInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()); // Returns YYYY-MM-DD
}

// ===== HELPER: Get current local date parts in a timezone =====
function getLocalDateParts(timezone: string, date: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);

  const year = parseInt(parts.find(p => p.type === 'year')!.value);
  const month = parseInt(parts.find(p => p.type === 'month')!.value);
  const day = parseInt(parts.find(p => p.type === 'day')!.value);
  return { year, month, day };
}

// ===== HELPER: Convert a local date in a timezone to a UTC Date =====
function localDateToUTC(year: number, month: number, day: number, hour: number, timezone: string): Date {
  // Create a reference date string in the target timezone, then find the UTC equivalent
  // Use a binary-search-like approach for precision
  const target = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  
  // Get the offset by checking what time it is in the timezone at our target UTC
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
  });
  
  // Estimate: try target as UTC, check local, adjust
  const localAtTarget = formatter.formatToParts(target);
  const localHour = parseInt(localAtTarget.find(p => p.type === 'hour')!.value);
  const localDay = parseInt(localAtTarget.find(p => p.type === 'day')!.value);
  const localMonth = parseInt(localAtTarget.find(p => p.type === 'month')!.value);
  
  // Calculate rough offset in hours
  let offsetHours = localHour - hour;
  if (localDay !== day || localMonth !== month) {
    // Day boundary crossed
    if (localDay > day || localMonth > month) offsetHours += 24;
    else offsetHours -= 24;
  }
  
  // The UTC time we want = target UTC - offset
  return new Date(target.getTime() - offsetHours * 3600000);
}

// ===== HELPER: Billing cycle dates in teacher's local timezone =====
function getBillingCycleDates(billingDay: number, timezone: string): { cycleStart: string; cycleEnd: string; cycleStartUTC: Date; cycleEndUTC: Date } {
  const { year, month, day } = getLocalDateParts(timezone);

  const adjustDayForMonth = (y: number, m: number, targetDay: number): number => {
    const lastDay = new Date(y, m, 0).getDate(); // m is 1-indexed here, Date(y,m,0) = last day of month m-1... 
    // Actually: new Date(year, month, 0).getDate() gives last day of previous month
    // For month m (1-indexed), last day = new Date(y, m, 0).getDate()
    const lastDayOfMonth = new Date(y, m, 0).getDate();
    return Math.min(targetDay, lastDayOfMonth);
  };

  let startYear: number, startMonth: number, startDay: number;
  let endYear: number, endMonth: number, endDay: number;

  if (day > billingDay) {
    // After billing day this month — cycle started this month
    startMonth = month;
    startYear = year;
    startDay = adjustDayForMonth(startYear, startMonth, billingDay);

    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) { nextMonth = 1; nextYear++; }
    endDay = adjustDayForMonth(nextYear, nextMonth, billingDay) - 1;
    if (endDay < 1) {
      // Go to last day of current month
      endDay = new Date(year, month, 0).getDate();
      endMonth = month;
      endYear = year;
    } else {
      endMonth = nextMonth;
      endYear = nextYear;
    }
  } else {
    // day <= billingDay: Close PREVIOUS cycle
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 1) { prevMonth = 12; prevYear--; }
    startDay = adjustDayForMonth(prevYear, prevMonth, billingDay);
    startMonth = prevMonth;
    startYear = prevYear;

    endDay = adjustDayForMonth(year, month, billingDay) - 1;
    if (endDay < 1) {
      endDay = new Date(prevYear, prevMonth, 0).getDate();
      endMonth = prevMonth;
      endYear = prevYear;
    } else {
      endMonth = month;
      endYear = year;
    }
  }

  const cycleStartStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const cycleEndStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  // Convert to UTC for created_at comparisons
  const cycleStartUTC = localDateToUTC(startYear, startMonth, startDay, 0, timezone);
  const cycleEndUTC = localDateToUTC(endYear, endMonth, endDay, 23, timezone);
  // Add buffer to end to cover the full day
  cycleEndUTC.setMinutes(59);
  cycleEndUTC.setSeconds(59);

  return { cycleStart: cycleStartStr, cycleEnd: cycleEndStr, cycleStartUTC, cycleEndUTC };
}

// ===== HELPER: Get due_date string in teacher's local timezone =====
function getDueDateString(paymentDueDays: number, timezone: string): string {
  const { year, month, day } = getLocalDateParts(timezone);
  const localDate = new Date(year, month - 1, day);
  localDate.setDate(localDate.getDate() + paymentDueDays);
  const y = localDate.getFullYear();
  const m = String(localDate.getMonth() + 1).padStart(2, '0');
  const d = String(localDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep("Starting automated billing process (hourly sweeper)");

    // ===== PHASE 5: Use RPC get_relationships_to_bill_now() instead of .eq('billing_day', today) =====
    const { data: relationshipsRaw, error: rpcError } = await supabaseAdmin
      .rpc('get_relationships_to_bill_now') as { data: any[] | null, error: any };

    if (rpcError) {
      logStep("Error calling get_relationships_to_bill_now RPC", rpcError);
      throw rpcError;
    }

    if (!relationshipsRaw || relationshipsRaw.length === 0) {
      logStep('No relationships to bill right now (hourly sweep)');
      return new Response(JSON.stringify({ message: 'Nenhum relacionamento para cobrar neste momento.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    logStep(`RPC returned ${relationshipsRaw.length} relationships to bill now`);

    // Enrich with teacher and student profiles sequentially
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

    const relationshipsToBill = relationshipsRaw.map(rel => ({
      ...rel,
      teacher: teacherMap.get(rel.teacher_id) || null,
      student: studentMap.get(rel.student_id) || null,
    }));

    logStep(`Found ${relationshipsToBill.length} relationships to bill`);

    let processedCount = 0;
    let errorCount = 0;

    for (const relationship of relationshipsToBill) {
      try {
        const teacher = relationship.teacher;
        const student = relationship.student;
        const teacherTimezone = relationship.teacher_timezone || 'America/Sao_Paulo';

        logStep(`Processing billing for: ${teacher?.name} -> ${student?.name} (tz: ${teacherTimezone})`);

        // Validar se o professor pode cobrar
        const canBill = await validateTeacherCanBill(teacher);
        if (!canBill) {
          logStep(`Skipping ${teacher?.name} -> ${student?.name} - no financial module access`);
          continue;
        }

        if (!relationship.business_profile_id) {
          logStep(`Skipping student ${student?.name}: no business profile defined for payment routing`);
          continue;
        }

        // Validar business_profile
        const { data: businessProfile, error: businessError } = await supabaseAdmin
          .from('business_profiles')
          .select('id, business_name, auto_generate_boleto')
          .eq('id', relationship.business_profile_id)
          .eq('user_id', relationship.teacher_id)
          .maybeSingle();

        if (businessError || !businessProfile) {
          logStep(`Skipping student ${student?.name}: business profile not found`, businessError);
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
          relationship_id: relationship.relationship_id,
          teacher_timezone: teacherTimezone,
        };

        // ===== CHECK MONTHLY SUBSCRIPTION =====
        const { data: activeSubscriptionData, error: subError } = await supabaseAdmin
          .rpc('get_student_active_subscription', {
            p_relationship_id: studentInfo.relationship_id,
            p_timezone: studentInfo.teacher_timezone
          }) as { data: ActiveSubscription[] | null, error: any };

        if (subError) {
          logStep(`Error checking active subscription for ${studentInfo.student_name}`, subError);
        }

        const activeSubscription = activeSubscriptionData && activeSubscriptionData.length > 0
          ? activeSubscriptionData[0]
          : null;

        const hasActiveSubscription = activeSubscription && activeSubscription.subscription_id;

        if (hasActiveSubscription) {
          logStep(`📦 Active monthly subscription found for ${studentInfo.student_name}`, {
            subscriptionName: activeSubscription.subscription_name,
            price: activeSubscription.price,
            startsAt: activeSubscription.starts_at
          });

          const subscriptionResult = await processMonthlySubscriptionBilling(studentInfo, activeSubscription);

          if (subscriptionResult.success) {
            processedCount++;
            logStep(`✅ Monthly subscription billing completed for ${studentInfo.student_name}`, subscriptionResult);
          } else {
            errorCount++;
            logStep(`❌ Monthly subscription billing failed for ${studentInfo.student_name}`, subscriptionResult.error);
          }
          continue;
        }

        // ===== TRADITIONAL PER-CLASS BILLING =====
        logStep(`📚 No active subscription - using traditional per-class billing for ${studentInfo.student_name}`);

        // Alert: old confirmed participations not marked as completed
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: confirmedParticipations, error: cpError } = await supabaseAdmin
          .from('class_participants')
          .select('id, class_id')
          .eq('student_id', studentInfo.student_id)
          .eq('status', 'confirmada');

        let oldConfirmedParticipations: any[] = [];
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

        if (oldConfirmedParticipations.length > 0) {
          logStep(`⚠️ ALERTA: ${oldConfirmedParticipations.length} aulas confirmadas com mais de 30 dias não foram marcadas como concluídas`, {
            student: studentInfo.student_name,
            teacher: studentInfo.teacher_name,
          });
        }

        // Get unbilled completed participations
        const { data: completedParticipations, error: classesError } = await supabaseAdmin
          .rpc('get_unbilled_participants_v2', {
            p_teacher_id: studentInfo.teacher_id,
            p_student_id: studentInfo.student_id,
            p_status: 'concluida'
          }) as { data: UnbilledParticipant[] | null, error: any };

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

        // Get unbilled cancelled participations with charge
        const { data: cancelledParticipations, error: cancelledError } = await supabaseAdmin
          .rpc('get_unbilled_participants_v2', {
            p_teacher_id: studentInfo.teacher_id,
            p_student_id: studentInfo.student_id,
            p_status: 'cancelada'
          }) as { data: UnbilledParticipant[] | null, error: any };

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

        if (cancelledError) {
          logStep(`Error fetching cancelled classes for ${studentInfo.student_name}`, cancelledError);
        }

        const unbilledClasses = classesToInvoice;
        const cancelledChargeable = cancelledClassesWithCharge;

        if (unbilledClasses.length === 0 && cancelledChargeable.length === 0) {
          logStep(`No unbilled classes or cancellation charges found for ${studentInfo.student_name}`);
          continue;
        }

        logStep(`Found ${unbilledClasses.length} unbilled participations and ${cancelledChargeable.length} cancellation charges for ${studentInfo.student_name}`);

        // Calculate total amount
        let totalAmount = 0;
        let completedClassesCount = 0;
        let cancellationChargesCount = 0;
        let dependentClassesCount = 0;

        let defaultServicePrice: number | null = null;
        const { data: defaultService } = await supabaseAdmin
          .from('class_services')
          .select('price')
          .eq('teacher_id', studentInfo.teacher_id)
          .eq('is_default', true)
          .eq('is_active', true)
          .maybeSingle();

        if (defaultService) defaultServicePrice = defaultService.price;

        for (const classItem of unbilledClasses) {
          const amount = classItem.class_services?.price || defaultServicePrice || 100;
          totalAmount += amount;
          completedClassesCount++;
          if (classItem.dependent_id) dependentClassesCount++;
        }

        for (const cancelledClass of cancelledChargeable) {
          const baseAmount = cancelledClass.class_services?.price || defaultServicePrice || 100;
          const { data: policy } = await supabaseAdmin
            .from('cancellation_policies')
            .select('charge_percentage')
            .eq('teacher_id', studentInfo.teacher_id)
            .eq('is_active', true)
            .maybeSingle();
          const chargePercentage = policy?.charge_percentage || 50;
          totalAmount += (baseAmount * chargePercentage) / 100;
          cancellationChargesCount++;
          if (cancelledClass.dependent_id) dependentClassesCount++;
        }

        const MINIMUM_BOLETO_AMOUNT = 5.00;
        const skipBoletoGeneration = totalAmount < MINIMUM_BOLETO_AMOUNT;
        
        // ===== TIMEZONE-AWARE: Use teacher's timezone for due_date =====
        const dueDateStr = getDueDateString(studentInfo.payment_due_days, studentInfo.teacher_timezone);

        // Build invoice items
        const invoiceItems = [];

        for (const classItem of unbilledClasses) {
          const service = classItem.class_services;
          const amount = service?.price || defaultServicePrice || 100;
          let description = `Aula de ${service?.name || 'serviço padrão'} - ${new Date(classItem.class_date).toLocaleDateString('pt-BR', { timeZone: studentInfo.teacher_timezone })}`;
          if (classItem.dependent_name) description = `[${classItem.dependent_name}] ${description}`;
          invoiceItems.push({
            class_id: classItem.id,
            participant_id: classItem.participant_id,
            item_type: 'completed_class',
            amount,
            description,
            cancellation_policy_id: null,
            charge_percentage: null,
            dependent_id: classItem.dependent_id
          });
        }

        for (const cancelledClass of cancelledChargeable) {
          const service = cancelledClass.class_services;
          const baseAmount = service?.price || defaultServicePrice || 100;
          const { data: policy } = await supabaseAdmin
            .from('cancellation_policies')
            .select('id, charge_percentage')
            .eq('teacher_id', studentInfo.teacher_id)
            .eq('is_active', true)
            .maybeSingle();
          const chargePercentage = policy?.charge_percentage || 50;
          const chargeAmount = (baseAmount * chargePercentage) / 100;
          let description = `Cancelamento - ${service?.name || 'serviço padrão'} (${chargePercentage}%)`;
          if (cancelledClass.dependent_name) description = `[${cancelledClass.dependent_name}] ${description}`;
          invoiceItems.push({
            class_id: cancelledClass.id,
            participant_id: cancelledClass.participant_id,
            item_type: 'cancellation_charge',
            amount: chargeAmount,
            description,
            cancellation_policy_id: policy?.id || null,
            charge_percentage: chargePercentage,
            dependent_id: cancelledClass.dependent_id
          });
        }

        // Build description
        const descriptionParts = [];
        if (completedClassesCount > 0) descriptionParts.push(`${completedClassesCount} aula${completedClassesCount > 1 ? 's' : ''}`);
        if (cancellationChargesCount > 0) descriptionParts.push(`${cancellationChargesCount} cancelamento${cancellationChargesCount > 1 ? 's' : ''}`);

        // Use teacher's local date for the description month
        const { year: localYear, month: localMonth } = getLocalDateParts(studentInfo.teacher_timezone);
        const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        let description = `Faturamento automático - ${monthNames[localMonth - 1]} de ${localYear} (${descriptionParts.join(' + ')})`;

        if (dependentClassesCount > 0) {
          const dependentNames = [...new Set([
            ...unbilledClasses.filter(c => c.dependent_name).map(c => c.dependent_name),
            ...cancelledChargeable.filter(c => c.dependent_name).map(c => c.dependent_name)
          ])];
          if (dependentNames.length > 0) description += ` - Inclui aulas de: ${dependentNames.join(', ')}`;
        }

        if (skipBoletoGeneration) {
          description += ` [Valor abaixo do mínimo R$ ${MINIMUM_BOLETO_AMOUNT.toFixed(2).replace('.', ',')} - sem boleto gerado]`;
        }

        const invoiceData = {
          student_id: studentInfo.student_id,
          teacher_id: studentInfo.teacher_id,
          amount: totalAmount,
          description,
          due_date: dueDateStr,
          status: 'pendente' as const,
          invoice_type: 'automated',
          business_profile_id: studentInfo.business_profile_id,
        };

        const { data: transactionResult, error: transactionError } = await supabaseAdmin
          .rpc('create_invoice_and_mark_classes_billed', {
            p_invoice_data: invoiceData,
            p_class_items: invoiceItems
          });

        if (transactionError || !transactionResult?.success) {
          logStep(`Error in atomic transaction for ${studentInfo.student_name}`, { error: transactionError, result: transactionResult });
          errorCount++;
          continue;
        }

        const invoiceId = transactionResult.invoice_id;

        // Generate boleto
        const teacherDisabledBoleto = businessProfile?.auto_generate_boleto === false;
        if (!teacherDisabledBoleto && !skipBoletoGeneration) {
          try {
            const { data: paymentResult, error: paymentError } = await supabaseAdmin.functions.invoke(
              'create-payment-intent-connect',
              { body: { invoice_id: invoiceId, payment_method: 'boleto' } }
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
              logStep(`Payment URL generated`, { invoiceId });
            }
          } catch (paymentGenerationError) {
            logStep(`Warning: Failed to generate payment URL`, paymentGenerationError);
          }
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
      status: 200,
    });
  }
});

// ===== MONTHLY SUBSCRIPTION BILLING =====
async function processMonthlySubscriptionBilling(
  studentInfo: StudentBillingInfo,
  subscription: ActiveSubscription
): Promise<{ success: boolean; invoiceId?: string; outsideCycleInvoiceId?: string; error?: string }> {
  try {
    const startsAt = new Date(subscription.starts_at);
    const MINIMUM_BOLETO_AMOUNT = 5.00;
    const tz = studentInfo.teacher_timezone;

    // ===== TIMEZONE-AWARE billing cycle =====
    const { cycleStart, cycleEnd, cycleStartUTC, cycleEndUTC } = getBillingCycleDates(studentInfo.billing_day, tz);

    logStep(`📅 Billing cycle (tz: ${tz})`, {
      cycleStart,
      cycleEnd,
      cycleStartUTC: cycleStartUTC.toISOString(),
      cycleEndUTC: cycleEndUTC.toISOString(),
    });

    // ===== IDEMPOTENCY: Check existing invoice using UTC window derived from teacher's local day =====
    // Convert "today midnight local" to UTC for the created_at comparison
    const { year: todayY, month: todayM, day: todayD } = getLocalDateParts(tz);
    const todayStartUTC = localDateToUTC(todayY, todayM, todayD, 0, tz);
    const todayEndUTC = localDateToUTC(todayY, todayM, todayD + 1, 0, tz); // Next day midnight local → UTC

    const { data: existingMonthlyInvoice } = await supabaseAdmin
      .from('invoices')
      .select('id, status')
      .eq('teacher_id', studentInfo.teacher_id)
      .eq('student_id', studentInfo.student_id)
      .eq('invoice_type', 'monthly_subscription')
      .eq('monthly_subscription_id', subscription.subscription_id)
      .gte('created_at', todayStartUTC.toISOString())
      .lt('created_at', todayEndUTC.toISOString())
      .maybeSingle();

    if (existingMonthlyInvoice) {
      logStep(`⚠️ IDEMPOTENCY: Monthly subscription invoice already exists for today (local)`, {
        existingInvoiceId: existingMonthlyInvoice.id,
        status: existingMonthlyInvoice.status,
        student: studentInfo.student_name
      });
      return { success: true, invoiceId: existingMonthlyInvoice.id };
    }

    // Get unbilled completed participations
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

    // Filter classes by billing cycle
    const effectiveCycleStart = startsAt > new Date(cycleStart + 'T00:00:00') ? startsAt : new Date(cycleStart + 'T00:00:00');
    const cycleEndDate = new Date(cycleEnd + 'T23:59:59');

    const normalizeDate = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

    const effectiveStartNorm = normalizeDate(effectiveCycleStart);
    const cycleEndNorm = normalizeDate(cycleEndDate);

    const classesInBillingCycle = allClasses.filter(c => {
      const classDateNorm = normalizeDate(new Date(c.class_date));
      return classDateNorm >= effectiveStartNorm && classDateNorm <= cycleEndNorm;
    });

    const classesOutsideCycle = allClasses.filter(c => {
      const classDateNorm = normalizeDate(new Date(c.class_date));
      return classDateNorm < effectiveStartNorm;
    });

    logStep(`📊 Classes filtered by billing cycle (${cycleStart} - ${cycleEnd})`, {
      inCycle: classesInBillingCycle.length,
      outsideCycle: classesOutsideCycle.length,
      total: allClasses.length
    });

    // Build invoice items
    const invoiceItems: any[] = [];
    let totalAmount = 0;

    // Monthly base
    const cycleStartFormatted = cycleStart.split('-').reverse().join('/');
    const cycleEndFormatted = cycleEnd.split('-').reverse().join('/');

    invoiceItems.push({
      class_id: null,
      participant_id: null,
      item_type: 'monthly_base',
      amount: subscription.price,
      description: `Mensalidade ${subscription.subscription_name} - Ciclo ${cycleStartFormatted} a ${cycleEndFormatted}`,
      cancellation_policy_id: null,
      charge_percentage: null,
      dependent_id: null
    });
    totalAmount += subscription.price;

    const skipBoletoGeneration = totalAmount < MINIMUM_BOLETO_AMOUNT;

    let description = `Mensalidade ${subscription.subscription_name} - Ciclo ${cycleStartFormatted} a ${cycleEndFormatted}`;
    if (skipBoletoGeneration) {
      description += ` [Valor abaixo do mínimo R$ ${MINIMUM_BOLETO_AMOUNT.toFixed(2).replace('.', ',')} - sem boleto gerado]`;
    }

    const dueDateStr = getDueDateString(studentInfo.payment_due_days, tz);

    const invoiceData = {
      student_id: studentInfo.student_id,
      teacher_id: studentInfo.teacher_id,
      amount: totalAmount,
      description,
      due_date: dueDateStr,
      status: 'pendente',
      invoice_type: 'monthly_subscription',
      business_profile_id: studentInfo.business_profile_id,
      monthly_subscription_id: subscription.subscription_id
    };

    const { data: transactionResult, error: transactionError } = await supabaseAdmin
      .rpc('create_invoice_and_mark_classes_billed', {
        p_invoice_data: invoiceData,
        p_class_items: invoiceItems
      });

    if (transactionError || !transactionResult?.success) {
      return { success: false, error: transactionError?.message || transactionResult?.error || 'Transaction failed' };
    }

    const invoiceId = transactionResult.invoice_id;

    await supabaseAdmin
      .from('invoices')
      .update({ monthly_subscription_id: subscription.subscription_id })
      .eq('id', invoiceId);

    logStep(`📦 Monthly subscription invoice created`, { invoiceId, totalAmount });

    // Generate boleto
    const { data: bpConfig } = await supabaseAdmin
      .from('business_profiles')
      .select('auto_generate_boleto')
      .eq('id', studentInfo.business_profile_id)
      .maybeSingle();

    const teacherDisabledBoleto = bpConfig?.auto_generate_boleto === false;

    if (!teacherDisabledBoleto && !skipBoletoGeneration) {
      try {
        const { data: paymentResult, error: paymentError } = await supabaseAdmin.functions.invoke(
          'create-payment-intent-connect',
          { body: { invoice_id: invoiceId, payment_method: 'boleto' } }
        );
        if (!paymentError && paymentResult?.boleto_url) {
          await supabaseAdmin.from('invoices').update({
            stripe_hosted_invoice_url: paymentResult.boleto_url,
            boleto_url: paymentResult.boleto_url,
            linha_digitavel: paymentResult.linha_digitavel,
            stripe_payment_intent_id: paymentResult.payment_intent_id
          }).eq('id', invoiceId);
        }
      } catch (paymentError) {
        logStep(`⚠️ Failed to generate boleto for monthly subscription`, paymentError);
      }
    }

    // Send notification
    try {
      await supabaseAdmin.functions.invoke('send-invoice-notification', {
        body: { invoice_id: invoiceId, notification_type: 'invoice_created' }
      });
    } catch (notifError) {
      logStep(`⚠️ Failed to send notification`, notifError);
    }

    // ===== PROCESS CLASSES OUTSIDE CYCLE =====
    let outsideCycleInvoiceId: string | null = null;

    if (classesOutsideCycle.length > 0) {
      logStep(`📦 Processing ${classesOutsideCycle.length} classes outside billing cycle`);

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
            description: `Aula avulsa (anterior à mensalidade) - ${classInfo.class_services?.name || 'Serviço'} - ${new Date(classInfo.class_date).toLocaleDateString('pt-BR', { timeZone: tz })}`,
            cancellation_policy_id: null,
            charge_percentage: null,
            dependent_id: classInfo.dependent_id || null
          });
        }
      }

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
          due_date: dueDateStr,
          status: 'pendente',
          invoice_type: 'automated',
          business_profile_id: studentInfo.business_profile_id,
          monthly_subscription_id: null
        };

        const { data: traditionalResult, error: traditionalError } = await supabaseAdmin
          .rpc('create_invoice_and_mark_classes_billed', {
            p_invoice_data: traditionalInvoiceData,
            p_class_items: traditionalItems
          });

        if (!traditionalError && traditionalResult?.success) {
          outsideCycleInvoiceId = traditionalResult.invoice_id;

          if (!skipTraditionalBoleto && !teacherDisabledBoleto) {
            try {
              const { data: paymentResult, error: paymentError } = await supabaseAdmin.functions.invoke(
                'create-payment-intent-connect',
                { body: { invoice_id: outsideCycleInvoiceId, payment_method: 'boleto' } }
              );
              if (!paymentError && paymentResult?.boleto_url) {
                await supabaseAdmin.from('invoices').update({
                  stripe_hosted_invoice_url: paymentResult.boleto_url,
                  boleto_url: paymentResult.boleto_url,
                  linha_digitavel: paymentResult.linha_digitavel,
                  stripe_payment_intent_id: paymentResult.payment_intent_id
                }).eq('id', outsideCycleInvoiceId);
              }
            } catch (paymentError) {
              logStep(`⚠️ Failed to generate boleto for traditional invoice`, paymentError);
            }
          }

          try {
            await supabaseAdmin.functions.invoke('send-invoice-notification', {
              body: { invoice_id: outsideCycleInvoiceId, notification_type: 'invoice_created' }
            });
          } catch (notifError) {
            logStep(`⚠️ Failed to send notification for traditional invoice`, notifError);
          }
        }
      }
    }

    return { success: true, invoiceId, outsideCycleInvoiceId: outsideCycleInvoiceId ?? undefined };

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Validation function to check if teacher can bill
async function validateTeacherCanBill(teacher: any): Promise<boolean> {
  try {
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('status, plan_id')
      .eq('user_id', teacher.id)
      .eq('status', 'active')
      .maybeSingle();

    if (subError || !subscription) return false;

    const { data: plan } = await supabaseAdmin
      .from('subscription_plans')
      .select('features')
      .eq('id', subscription.plan_id)
      .maybeSingle();

    return plan?.features?.financial_module === true;
  } catch (error) {
    console.error('Error validating teacher billing permissions:', error);
    return false;
  }
}

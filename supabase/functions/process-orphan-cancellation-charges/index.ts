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
  console.log(`[ORPHAN-CHARGES] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep("Starting orphan cancellation charges processing");

    // Buscar todas as aulas canceladas com cobrança aplicada, mas não faturadas há mais de 45 dias
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 45);

    const { data: orphanParticipants, error: orphanError } = await supabaseAdmin
      .from('class_participants')
      .select(`
        id,
        class_id,
        student_id,
        cancelled_at,
        charge_applied,
        cancellation_reason,
        classes!inner (
          id,
          teacher_id,
          service_id,
          class_services (
            id,
            name,
            price
          )
        ),
        student:profiles!class_participants_student_id_fkey (
          id,
          name,
          email
        )
      `)
      .eq('status', 'cancelada')
      .eq('charge_applied', true)
      .eq('billed', false)
      .lt('cancelled_at', cutoffDate.toISOString());

    if (orphanError) {
      logStep("Error fetching orphan participants", orphanError);
      throw orphanError;
    }

    if (!orphanParticipants || orphanParticipants.length === 0) {
      logStep('No orphan cancellation charges found');
      return new Response(JSON.stringify({ 
        message: 'Nenhuma cobrança órfã encontrada.',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    logStep(`Found ${orphanParticipants.length} orphan cancellation charges`);

    // Agrupar por relacionamento professor-aluno
    const groupedCharges = new Map();
    
    for (const participant of orphanParticipants) {
      const classData = Array.isArray(participant.classes) ? participant.classes[0] : participant.classes;
      const student = Array.isArray(participant.student) ? participant.student[0] : participant.student;

      // Buscar dados do professor e relacionamento
      const { data: teacherData } = await supabaseAdmin
        .from('profiles')
        .select('id, name, payment_due_days')
        .eq('id', classData.teacher_id)
        .single();

      const { data: relationshipData } = await supabaseAdmin
        .from('teacher_student_relationships')
        .select('business_profile_id')
        .eq('teacher_id', classData.teacher_id)
        .eq('student_id', participant.student_id)
        .single();

      // Validar se o professor tem módulo financeiro
      const { data: hasFinancialModule } = await supabaseAdmin
        .rpc('teacher_has_financial_module', { teacher_id: classData.teacher_id });

      if (!hasFinancialModule) {
        logStep(`Skipping participant ${participant.id} - teacher has no financial module`);
        // Remover cobrança se não tem módulo financeiro
        await supabaseAdmin
          .from('class_participants')
          .update({ charge_applied: false, billed: true })
          .eq('id', participant.id);
        continue;
      }

      const key = `${classData.teacher_id}-${participant.student_id}`;
      
      if (!groupedCharges.has(key)) {
        groupedCharges.set(key, {
          teacher_id: classData.teacher_id,
          student_id: participant.student_id,
          teacher_name: teacherData?.name || '',
          student_name: student?.name || '',
          student_email: student?.email || '',
          payment_due_days: teacherData?.payment_due_days || 15,
          business_profile_id: relationshipData?.business_profile_id,
          participants: []
        });
      }
      
      groupedCharges.get(key).participants.push({
        ...participant,
        classData
      });
    }

    let processedCount = 0;
    let errorCount = 0;

    // Processar cada grupo
    for (const [key, group] of groupedCharges) {
      try {
        logStep(`Processing orphan charges for ${group.teacher_name} -> ${group.student_name}`);

        if (!group.business_profile_id) {
          logStep(`Skipping ${group.student_name}: no business profile`);
          errorCount++;
          continue;
        }

        let totalAmount = 0;
        const participantIds = [];

        // Calcular valor total das cobranças
        for (const participant of group.participants) {
          const service = Array.isArray(participant.classData.class_services) 
            ? participant.classData.class_services[0] 
            : participant.classData.class_services;
          
          const baseAmount = service?.price || 100;

          // Buscar política de cancelamento
          const { data: policy } = await supabaseAdmin
            .from('cancellation_policies')
            .select('charge_percentage')
            .eq('teacher_id', group.teacher_id)
            .eq('is_active', true)
            .maybeSingle();

          const chargePercentage = policy?.charge_percentage || 50;
          const chargeAmount = (baseAmount * chargePercentage) / 100;
          
          totalAmount += chargeAmount;
          participantIds.push(participant.id);
        }

        logStep(`Total orphan charges: R$ ${totalAmount.toFixed(2)} for ${participantIds.length} cancellations`);

        const now = new Date();
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + group.payment_due_days);

        const invoiceData = {
          student_id: group.student_id,
          teacher_id: group.teacher_id,
          amount: totalAmount,
          description: `Cobrança de cancelamentos pendentes - ${group.participants.length} cancelamento${group.participants.length > 1 ? 's' : ''}`,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pendente' as const,
          invoice_type: 'orphan_charges',
          business_profile_id: group.business_profile_id,
        };

        // Criar fatura
        const { data: invoiceResult, error: invoiceError } = await supabaseAdmin
          .from('invoices')
          .insert(invoiceData)
          .select()
          .single();

        if (invoiceError) {
          logStep(`Error creating invoice`, invoiceError);
          errorCount++;
          continue;
        }

        // Marcar participantes como faturados
        const { error: updateError } = await supabaseAdmin
          .from('class_participants')
          .update({ billed: true })
          .in('id', participantIds);

        if (updateError) {
          logStep(`Error marking participants as billed`, updateError);
          errorCount++;
          continue;
        }

        const transactionResult = { success: true, invoice_id: invoiceResult.id };

        logStep(`Orphan charges invoice created`, { 
          invoiceId: transactionResult.invoice_id,
          amount: totalAmount
        });

        processedCount++;

      } catch (error) {
        logStep(`Error processing orphan charges group`, error);
        errorCount++;
      }
    }

    const message = `Orphan charges processing completed. Processed: ${processedCount}, Errors: ${errorCount}`;
    logStep(message);

    return new Response(JSON.stringify({ 
      success: true,
      message,
      processed: processedCount,
      errors: errorCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    logStep('General error in orphan charges processing', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

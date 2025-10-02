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

    const { data: orphanClasses, error: orphanError } = await supabaseAdmin
      .from('classes')
      .select(`
        id,
        teacher_id,
        student_id,
        service_id,
        cancelled_at,
        class_services (
          id,
          name,
          price
        ),
        teacher:profiles!classes_teacher_id_fkey (
          id,
          name,
          payment_due_days
        ),
        student:profiles!classes_student_id_fkey (
          id,
          name,
          email
        ),
        relationship:teacher_student_relationships!inner (
          id,
          business_profile_id,
          billing_day
        )
      `)
      .eq('status', 'cancelada')
      .eq('charge_applied', true)
      .eq('billed', false)
      .lt('cancelled_at', cutoffDate.toISOString());

    if (orphanError) {
      logStep("Error fetching orphan classes", orphanError);
      throw orphanError;
    }

    if (!orphanClasses || orphanClasses.length === 0) {
      logStep('No orphan cancellation charges found');
      return new Response(JSON.stringify({ 
        message: 'Nenhuma cobrança órfã encontrada.',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    logStep(`Found ${orphanClasses.length} orphan cancellation charges`);

    // Agrupar por relacionamento professor-aluno
    const groupedCharges = new Map();
    
    for (const classItem of orphanClasses) {
      const teacher = Array.isArray(classItem.teacher) ? classItem.teacher[0] : classItem.teacher;
      const student = Array.isArray(classItem.student) ? classItem.student[0] : classItem.student;
      const relationship = Array.isArray(classItem.relationship) ? classItem.relationship[0] : classItem.relationship;

      // Validar se o professor tem módulo financeiro
      const { data: hasFinancialModule } = await supabaseAdmin
        .rpc('teacher_has_financial_module', { teacher_id: classItem.teacher_id });

      if (!hasFinancialModule) {
        logStep(`Skipping class ${classItem.id} - teacher has no financial module`);
        // Remover cobrança se não tem módulo financeiro
        await supabaseAdmin
          .from('classes')
          .update({ charge_applied: false, billed: true })
          .eq('id', classItem.id);
        continue;
      }

      const key = `${classItem.teacher_id}-${classItem.student_id}`;
      
      if (!groupedCharges.has(key)) {
        groupedCharges.set(key, {
          teacher_id: classItem.teacher_id,
          student_id: classItem.student_id,
          teacher_name: teacher?.name || '',
          student_name: student?.name || '',
          student_email: student?.email || '',
          payment_due_days: teacher?.payment_due_days || 15,
          business_profile_id: relationship?.business_profile_id,
          classes: []
        });
      }
      
      groupedCharges.get(key).classes.push(classItem);
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
        const classIds = [];

        // Calcular valor total das cobranças
        for (const classItem of group.classes) {
          const service = Array.isArray(classItem.class_services) 
            ? classItem.class_services[0] 
            : classItem.class_services;
          
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
          classIds.push(classItem.id);
        }

        logStep(`Total orphan charges: R$ ${totalAmount.toFixed(2)} for ${classIds.length} classes`);

        const now = new Date();
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + group.payment_due_days);

        const invoiceData = {
          student_id: group.student_id,
          teacher_id: group.teacher_id,
          amount: totalAmount,
          description: `Cobrança de cancelamentos pendentes - ${group.classes.length} cancelamento${group.classes.length > 1 ? 's' : ''}`,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pendente' as const,
          invoice_type: 'orphan_charges',
          business_profile_id: group.business_profile_id,
        };

        // Criar fatura e marcar classes atomicamente
        const { data: transactionResult, error: transactionError } = await supabaseAdmin
          .rpc('create_invoice_and_mark_classes_billed', {
            p_invoice_data: invoiceData,
            p_class_ids: classIds
          });

        if (transactionError || !transactionResult?.success) {
          logStep(`Error creating orphan charges invoice`, {
            error: transactionError,
            result: transactionResult
          });
          errorCount++;
          continue;
        }

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

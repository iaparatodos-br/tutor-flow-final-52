import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CancellationRequest {
  class_id: string;
  cancelled_by: string;
  reason: string;
  cancelled_by_type: 'student' | 'teacher';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { class_id, cancelled_by, reason, cancelled_by_type }: CancellationRequest = await req.json();

    // Get class details (including is_group_class)
    const { data: classData, error: classError } = await supabaseClient
      .from('classes')
      .select('*, is_group_class, profiles!classes_teacher_id_fkey(name)')
      .eq('id', class_id)
      .maybeSingle();

    if (classError || !classData) {
      throw new Error('Aula não encontrada');
    }

    // Fetch participants if it's a group class
    let participants: any[] = [];
    if (classData.is_group_class) {
      const { data: participantsData, error: participantsError } = await supabaseClient
        .from('class_participants')
        .select('student_id, profiles!class_participants_student_id_fkey(name, email, guardian_email)')
        .eq('class_id', class_id);

      if (participantsError) {
        console.error('Error fetching participants:', participantsError);
      } else {
        participants = participantsData || [];
      }
      
      console.log(`Group class with ${participants.length} participants`);
    }

    // VALIDAÇÃO 1: Verificar se a aula já foi cancelada
    if (classData.status === 'cancelada') {
      throw new Error('Esta aula já foi cancelada anteriormente');
    }

    // VALIDAÇÃO 2: Verificar se a aula já ocorreu (está no passado)
    const classDate = new Date(classData.class_date);
    const now = new Date();
    if (classDate < now && classData.status === 'concluida') {
      throw new Error('Não é possível cancelar uma aula que já foi concluída');
    }

    // VALIDAÇÃO 3: Verificar permissão do usuário
    // Professor pode cancelar suas próprias aulas
    // Aluno pode cancelar se for o aluno da aula (individual) ou participante (grupo)
    if (cancelled_by_type === 'teacher') {
      if (classData.teacher_id !== cancelled_by) {
        throw new Error('Você não tem permissão para cancelar esta aula');
      }
    } else if (cancelled_by_type === 'student') {
      // Para aulas individuais
      if (classData.student_id === cancelled_by) {
        // OK, aluno pode cancelar sua própria aula
      } else {
        // Para aulas em grupo, verificar se é participante
        const { data: participation, error: participationError } = await supabaseClient
          .from('class_participants')
          .select('id')
          .eq('class_id', class_id)
          .eq('student_id', cancelled_by)
          .maybeSingle();

        if (participationError || !participation) {
          throw new Error('Você não tem permissão para cancelar esta aula');
        }
      }
    }

    // Get teacher's cancellation policy
    const { data: policy, error: policyError } = await supabaseClient
      .from('cancellation_policies')
      .select('*')
      .eq('teacher_id', classData.teacher_id)
      .eq('is_active', true)
      .maybeSingle();

    if (policyError && policyError.code !== 'PGRST116') {
      console.error('Error fetching cancellation policy:', policyError);
    } else if (!policy) {
      console.log('No active cancellation policy found, using defaults');
    }

    const hoursBeforeClass = policy?.hours_before_class || 24;
    const chargePercentage = policy?.charge_percentage || 0;
    
    // Calculate time difference (reutilizar now e classDate das validações)
    const hoursUntilClass = (classDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    let shouldCharge = false;
    
    // Only charge students who cancel late
    if (cancelled_by_type === 'student' && hoursUntilClass < hoursBeforeClass && chargePercentage > 0) {
      shouldCharge = true;
    }

    console.log('Processing cancellation:', {
      class_id,
      cancelled_by_type,
      hoursUntilClass,
      hoursBeforeClass,
      chargePercentage,
      shouldCharge
    });

    // PROTEÇÃO: Bloquear processamento concorrente - usar timestamp de processamento
    const processingLock = `cancellation_${class_id}_${now.getTime()}`;
    
    // Update class - sempre usar status 'cancelada', diferenciar com charge_applied boolean
    const { error: updateError } = await supabaseClient
      .from('classes')
      .update({
        status: 'cancelada',
        cancellation_reason: reason,
        cancelled_at: now.toISOString(),
        cancelled_by: cancelled_by,
        charge_applied: shouldCharge,
        billed: false // Garantir que está marcada como não faturada ainda
      })
      .eq('id', class_id)
      .eq('status', classData.status); // Garantir que só atualiza se o status ainda for o original

    if (updateError) {
      console.error('Error updating class:', updateError);
      
      // Se erro for de concorrência (nenhuma linha afetada), significa que houve cancelamento duplicado
      if (updateError.code === 'PGRST116' || updateError.message?.includes('0 rows')) {
        throw new Error('Esta aula já está sendo cancelada ou foi cancelada recentemente');
      }
      
      throw new Error('Erro ao atualizar aula');
    }

    // NOTIFICAÇÃO: Criar registro de notificação e enviar email
    try {
      const notificationType = shouldCharge ? 'cancellation_with_charge' : 'cancellation_free';
      
      // Create notification records for all affected students
      const studentsToNotify = classData.is_group_class 
        ? participants.map(p => p.student_id)
        : [classData.student_id];

      for (const studentId of studentsToNotify) {
        await supabaseClient
          .from('class_notifications')
          .insert({
            class_id: class_id,
            student_id: studentId,
            notification_type: notificationType,
            status: 'sent'
          });
      }
      
      console.log(`Created ${studentsToNotify.length} notification record(s)`);

      // Enviar email de notificação de forma assíncrona (não bloquear resposta)
      supabaseClient.functions.invoke('send-cancellation-notification', {
        body: {
          class_id: class_id,
          cancelled_by_type: cancelled_by_type,
          charge_applied: shouldCharge,
          cancellation_reason: reason,
          is_group_class: classData.is_group_class,
          participants: participants.map(p => ({
            student_id: p.student_id,
            profile: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
          }))
        }
      }).then(({ error: emailError }) => {
        if (emailError) {
          console.error('Error sending notification email (non-critical):', emailError);
        } else {
          console.log('Notification email sent successfully');
        }
      });

    } catch (notificationError) {
      console.error('Error creating notification (non-critical):', notificationError);
      // Não falhar o cancelamento por causa de erro na notificação
    }

    // Check if teacher has financial module access (only if charging)
    if (shouldCharge) {
      const { data: hasFinancialModule, error: featureError } = await supabaseClient
        .rpc('teacher_has_financial_module', { teacher_id: classData.teacher_id });

      if (featureError) {
        console.error('Error checking financial module access:', featureError);
      }

      if (!hasFinancialModule) {
        console.log('Teacher does not have financial module access, removing charge');
        // Update class to remove charge if no financial module
        const { error: updateError } = await supabaseClient
          .from('classes')
          .update({ charge_applied: false })
          .eq('id', class_id);

        if (updateError) {
          console.error('Error updating class charge status:', updateError);
        }

        return new Response(JSON.stringify({ 
          success: true, 
          charged: false,
          message: 'Aula cancelada sem cobrança - módulo financeiro não disponível'
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      charged: shouldCharge,
      message: shouldCharge 
        ? 'Aula cancelada. A cobrança será incluída na próxima fatura mensal.' 
        : 'Aula cancelada sem cobrança'
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error('Error processing cancellation:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
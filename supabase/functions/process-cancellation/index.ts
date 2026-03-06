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
  dependent_id?: string; // NEW: Support for dependent cancellation
  participants?: Array<{
    student_id: string;
    dependent_id?: string; // NEW: Support for dependent
    profile: { id: string; name: string; email: string };
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // AUTH: Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header provided" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const authUserId = userData.user.id;
    console.log('✅ User authenticated:', authUserId);

    const { 
      class_id, 
      cancelled_by, 
      reason, 
      cancelled_by_type, 
      dependent_id,
      participants: requestParticipants 
    }: CancellationRequest = await req.json();

    // AUTH: Prevent identity spoofing — force cancelled_by to be the authenticated user
    const safeCancelledBy = authUserId;

    // 1. Buscar dados da aula sem FK
    const { data: classData, error: classError } = await supabaseClient
      .from('classes')
      .select('id, teacher_id, class_date, status, is_group_class, service_id, is_experimental, is_paid_class')
      .eq('id', class_id)
      .maybeSingle();

    if (classError || !classData) {
      throw new Error('Aula não encontrada');
    }

    // 2. Buscar participantes sem FK (incluindo dependent_id)
    const { data: participantsRaw, error: participantsError } = await supabaseClient
      .from('class_participants')
      .select('student_id, dependent_id')
      .eq('class_id', class_id);

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      throw new Error('Erro ao buscar participantes da aula');
    }

    // 3. Priorizar participantes da request (para aulas virtuais), ou buscar do banco (fallback)
    let participants: Array<{
      student_id: string;
      dependent_id?: string;
      profiles: { id: string; name: string; email: string };
    }> = [];
    
    if (requestParticipants && requestParticipants.length > 0) {
      // Usar dados da request (mais confiáveis para aulas virtuais)
      console.log('📊 Using participants from request:', requestParticipants.length);
      participants = requestParticipants.map(p => ({
        student_id: p.student_id,
        dependent_id: p.dependent_id,
        profiles: p.profile
      }));
    } else {
      // Fallback: buscar perfis dos participantes do banco (para aulas normais)
      console.log('📊 Fetching participants from database');
      for (const p of (participantsRaw || [])) {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('id, name, email')
          .eq('id', p.student_id)
          .maybeSingle();
        
        if (profile) {
          participants.push({
            student_id: p.student_id,
            dependent_id: p.dependent_id,
            profiles: profile
          });
        }
      }
    }

    // NEW: Buscar dados do dependente se está cancelando para um dependente
    let dependentName: string | null = null;
    let dependentData: { name: string; responsible_id: string } | null = null;
    if (dependent_id) {
      const { data: dependent } = await supabaseClient
        .from('dependents')
        .select('name, responsible_id')
        .eq('id', dependent_id)
        .maybeSingle();
      
      if (dependent) {
        dependentData = dependent;
        dependentName = dependent.name;
        console.log(`📌 Cancelamento para dependente: ${dependentName}`);
        
        // Validar que o cancelled_by é o responsável pelo dependente
        if (cancelled_by_type === 'student' && dependent.responsible_id !== safeCancelledBy) {
          throw new Error('Você não tem permissão para cancelar aulas deste dependente');
        }
      }
    }
    
    // Buscar preço do serviço para cálculo da multa
    let servicePrice = 0;
    if (classData.service_id) {
      const { data: service } = await supabaseClient
        .from('class_services')
        .select('price')
        .eq('id', classData.service_id)
        .maybeSingle();
      
      if (service) {
        servicePrice = Number(service.price);
        console.log('Service price found:', servicePrice);
      }
    }
    
    // ✅ DIAGNÓSTICO: Log detalhado da aula e participantes
    console.log('🔍 DEBUG - Cancellation request data:', {
      class_id,
      is_group_class: classData.is_group_class,
      participants_count: participants.length,
      participants_ids: participants.map(p => p.student_id),
      cancelled_by: safeCancelledBy,
      cancelled_by_type,
      dependent_id,
      dependent_name: dependentName,
      class_date: classData.class_date,
      class_status: classData.status
    });

    // ⚠️ VALIDAÇÃO: Detectar inconsistência entre is_group_class e número de participantes
    if (participants.length > 1 && !classData.is_group_class) {
      console.error('⚠️ INCONSISTÊNCIA DETECTADA: Múltiplos participantes mas is_group_class=false', {
        class_id,
        participants_count: participants.length,
        is_group_class: classData.is_group_class,
        participants: participants.map(p => ({ student_id: p.student_id }))
      });
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
    if (cancelled_by_type === 'teacher') {
      if (classData.teacher_id !== safeCancelledBy) {
        throw new Error('Você não tem permissão para cancelar esta aula');
      }
    } else if (cancelled_by_type === 'student') {
      // Verificar se é participante (tanto para aulas individuais quanto em grupo)
      // Usa .limit(1) em vez de .maybeSingle() para tolerar múltiplas linhas
      // (ex: responsável com 2+ dependentes na mesma aula)
      const { data: participationRows, error: participationError } = await supabaseClient
        .from('class_participants')
        .select('id')
        .eq('class_id', class_id)
        .eq('student_id', safeCancelledBy)
        .limit(1);

      if (participationError || !participationRows || participationRows.length === 0) {
        throw new Error('Você não tem permissão para cancelar esta aula');
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
    
    // Calculate time difference
    const hoursUntilClass = (classDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    let shouldCharge = false;
    
    // CRITICAL: Experimental classes NEVER generate cancellation charges
    if (classData.is_experimental === true) {
      console.log('🔬 Experimental class detected - no charge will be applied');
      shouldCharge = false;
    }
    // FASE 6: Aulas gratuitas (is_paid_class = false) nunca geram cobrança de cancelamento
    else if (classData.is_paid_class === false) {
      console.log('🆓 Unpaid class (is_paid_class=false) - no charge will be applied');
      shouldCharge = false;
    }
    // FASE 6: Aulas pré-pagas nunca geram cobrança de cancelamento (ajuste manual professor-aluno)
    else {
      // Buscar charge_timing do business_profiles do professor
      const { data: bpData } = await supabaseClient
        .from('business_profiles')
        .select('charge_timing')
        .eq('user_id', classData.teacher_id)
        .maybeSingle();

      if (bpData?.charge_timing === 'prepaid' && classData.is_paid_class === true) {
        console.log('💳 Prepaid class - no cancellation charge (already billed upfront)');
        shouldCharge = false;
      } else if (cancelled_by_type === 'student' && hoursUntilClass < hoursBeforeClass && chargePercentage > 0) {
        // Only charge students who cancel late (postpaid + paid class)
        shouldCharge = true;
      }
    }

    console.log('Processing cancellation:', {
      class_id,
      cancelled_by_type,
      hoursUntilClass,
      hoursBeforeClass,
      chargePercentage,
      shouldCharge,
      is_group_class: classData.is_group_class,
      dependent_id,
      dependent_name: dependentName
    });

    // ===== NOVA LÓGICA: Determinar tipo de cancelamento =====
    const isStudentLeavingGroupClass = cancelled_by_type === 'student' && classData.is_group_class;

    if (isStudentLeavingGroupClass) {
      // CENÁRIO 1: Aluno/Responsável saindo de aula em grupo
      console.log('Student leaving group class - updating only participant status');
      
      // Cancel ALL participations for this student/responsible (self + dependents)
      const { data: updatedRows, error: updateParticipantError } = await supabaseClient
        .from('class_participants')
        .update({
          status: 'cancelada',
          cancelled_at: now.toISOString(),
          cancelled_by: safeCancelledBy,
          charge_applied: shouldCharge,
          cancellation_reason: reason
        })
        .eq('class_id', class_id)
        .eq('student_id', safeCancelledBy)
        .select('id');

      if (updateParticipantError) {
        console.error('Error updating participant:', updateParticipantError);
        throw new Error('Erro ao atualizar participante');
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error('No participants were updated - possible data inconsistency');
        throw new Error('Nenhum participante elegível para cancelamento');
      }

      console.log(`✅ Updated ${updatedRows.length} participant(s) to cancelada`);

      // Notificar apenas o professor
      await supabaseClient.from('class_notifications').insert({
        class_id: class_id,
        student_id: classData.teacher_id,
        notification_type: shouldCharge ? 'participant_left_with_charge' : 'participant_left',
        status: 'sent'
      });

      // Email ao professor sobre saída do participante
      supabaseClient.functions.invoke('send-cancellation-notification', {
        body: {
          class_id,
          cancelled_by_type: 'student',
          charge_applied: shouldCharge,
          cancellation_reason: reason,
          is_group_class: true,
          notification_target: 'teacher',
          removed_student_id: safeCancelledBy,
          removed_dependent_id: dependent_id // NEW: Passar dependent_id
        }
      }).then(({ error: emailError }) => {
        if (emailError) {
          console.error('Error sending notification email (non-critical):', emailError);
        }
      });

      console.log(`Participant ${dependent_id ? `dependent ${dependent_id}` : safeCancelledBy} removed from group class ${class_id}`);

    } else {
      // CENÁRIO 2: Professor cancela ou aula individual
      console.log('Full class cancellation - updating all participants');
      
      // Cancelar TODOS os participantes
      const { error: cancelAllError } = await supabaseClient
        .from('class_participants')
        .update({
          status: 'cancelada',
          cancelled_at: now.toISOString(),
          cancelled_by: safeCancelledBy,
          charge_applied: shouldCharge,
          cancellation_reason: reason
        })
        .eq('class_id', class_id);

      if (cancelAllError) {
        console.error('Error cancelling participants:', cancelAllError);
        throw new Error('Erro ao cancelar participantes');
      }

      // Atualizar a classe
      await supabaseClient
        .from('classes')
        .update({
          status: 'cancelada',
          cancelled_at: now.toISOString(),
          cancelled_by: safeCancelledBy,
          cancellation_reason: reason,
          charge_applied: shouldCharge
        })
        .eq('id', class_id);

      // Create notification records for all affected students
      const studentsToNotify = participants.map(p => p.student_id);

      const notificationType = shouldCharge ? 'cancellation_with_charge' : 'cancellation_free';
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

      // Enviar email de notificação
      supabaseClient.functions.invoke('send-cancellation-notification', {
        body: {
          class_id: class_id,
          cancelled_by_type: cancelled_by_type,
          charge_applied: shouldCharge,
          cancellation_reason: reason,
          is_group_class: classData.is_group_class,
          participants: participants.map(p => ({
            student_id: p.student_id,
            dependent_id: p.dependent_id, // NEW: Passar dependent_id
            profile: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
          }))
        }
      }).then(({ error: emailError }) => {
        if (emailError) {
          console.error('Error sending notification email (non-critical):', emailError);
        }
      });

      console.log(`Full class ${class_id} cancelled for ${studentsToNotify.length} students`);
    }

    // Check if teacher has financial module access and create invoice (only if charging)
    if (shouldCharge) {
      const { data: hasFinancialModule, error: featureError } = await supabaseClient
        .rpc('teacher_has_financial_module', { teacher_id: classData.teacher_id });

      if (featureError) {
        console.error('Error checking financial module access:', featureError);
      }

      if (!hasFinancialModule) {
        console.log('Teacher does not have financial module access, removing charge');
        
        // Update participant charge status
        let updateChargeQuery = supabaseClient
          .from('class_participants')
          .update({ charge_applied: false })
          .eq('class_id', class_id);

        if (dependent_id) {
          updateChargeQuery = updateChargeQuery.eq('dependent_id', dependent_id);
        } else {
          updateChargeQuery = updateChargeQuery.eq('student_id', safeCancelledBy);
        }

        await updateChargeQuery;

        return new Response(JSON.stringify({ 
          success: true, 
          charged: false,
          type: isStudentLeavingGroupClass ? 'participant_removed' : 'full_cancellation',
          dependent_name: dependentName,
          message: 'Aula cancelada sem cobrança - módulo financeiro não disponível'
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // ===== CRIAR FATURA IMEDIATAMENTE =====
      console.log('Creating immediate cancellation invoice...');
      
      // Determinar quem será cobrado (responsável se for dependente)
      let billingStudentId = safeCancelledBy;
      if (dependent_id && dependentData) {
        billingStudentId = dependentData.responsible_id;
      }
      
      // Calcular valor da multa
      const chargeAmount = servicePrice > 0 
        ? servicePrice * (chargePercentage / 100)
        : 0;
      
      console.log('Cancellation charge calculation:', {
        servicePrice,
        chargePercentage,
        chargeAmount,
        billingStudentId,
        dependent_id
      });
      
      if (chargeAmount >= 5) { // Mínimo para boleto: R$ 5,00
        try {
          // v3.3: Buscar timezone do professor para formatar data
          const { data: teacherProfileTz } = await supabaseClient
            .from('profiles')
            .select('timezone')
            .eq('id', classData.teacher_id)
            .maybeSingle();
          const teacherTz = teacherProfileTz?.timezone || 'America/Sao_Paulo';
          
          const classDateFormatted = new Intl.DateTimeFormat('pt-BR', {
            timeZone: teacherTz,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }).format(new Date(classData.class_date));
          const invoicePayload = {
            student_id: billingStudentId,
            dependent_id: dependent_id || undefined,
            amount: chargeAmount,
            original_amount: servicePrice,
            description: `Taxa de cancelamento${dependentName ? ` [${dependentName}]` : ''} - Aula ${classDateFormatted}`,
            invoice_type: 'cancellation',
            class_ids: [class_id],
            cancellation_policy_id: policy?.id
          };
          
          console.log('Invoice payload:', JSON.stringify(invoicePayload));
          
          // #563: Invocar create-invoice com token do usuário autenticado (não SERVICE_ROLE_KEY)
          const { data: invoiceResult, error: invoiceError } = await supabaseClient
            .functions.invoke('create-invoice', {
              body: invoicePayload,
              headers: {
                Authorization: `Bearer ${token}`
              }
            });
          
          if (invoiceError) {
            console.error('Error creating cancellation invoice:', invoiceError);
            // Não falhar o cancelamento, apenas logar
          } else if (invoiceResult?.success) {
            console.log('Cancellation invoice created successfully:', invoiceResult.invoice?.id);
          } else {
            console.warn('Invoice creation returned unsuccessful:', invoiceResult);
          }
        } catch (invoiceCreationError) {
          console.error('Exception creating cancellation invoice:', invoiceCreationError);
          // Não falhar o cancelamento
        }
      } else {
        console.log('Charge amount below minimum for boleto, skipping invoice creation', { chargeAmount, minimum: 5 });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      charged: shouldCharge,
      type: isStudentLeavingGroupClass ? 'participant_removed' : 'full_cancellation',
      dependent_name: dependentName,
      message: isStudentLeavingGroupClass
        ? (shouldCharge 
          ? `${dependentName ? dependentName + ' foi removido(a)' : 'Você foi removido'} da aula. Taxa de cancelamento será aplicada.` 
          : `${dependentName ? dependentName + ' foi removido(a)' : 'Você foi removido'} da aula sem cobrança.`)
        : (shouldCharge 
          ? 'Aula cancelada. Taxa de cancelamento será aplicada.' 
          : 'Aula cancelada sem cobrança.')
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error('Error processing cancellation:', error);
    // Return 200 with error details to prevent retry storms
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});

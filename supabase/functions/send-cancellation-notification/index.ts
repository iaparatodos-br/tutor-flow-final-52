import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/ses-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  class_id: string;
  cancelled_by_type: 'student' | 'teacher';
  charge_applied: boolean;
  cancellation_reason: string;
  is_group_class?: boolean;
  notification_target?: 'teacher' | 'students';
  removed_student_id?: string;
  removed_dependent_id?: string; // NEW: Support for dependent
  participants?: Array<{
    student_id: string;
    dependent_id?: string; // NEW: Support for dependent
    profile: {
      name: string;
      email: string;
    };
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    // AUTH: Validate caller is service role or authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header", success: false }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === supabaseServiceKey;
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      supabaseServiceKey,
      { auth: { persistSession: false } }
    );
    
    if (!isServiceRole) {
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData.user) {
        return new Response(JSON.stringify({ error: "Authentication failed", success: false }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      console.log('[send-cancellation-notification] Authenticated user:', userData.user.id);
    }
    const { 
      class_id, 
      cancelled_by_type, 
      charge_applied, 
      cancellation_reason,
      is_group_class = false,
      notification_target,
      removed_student_id,
      removed_dependent_id,
      participants = []
    }: NotificationRequest = await req.json();

    const supabaseClient = supabase;

    // 1. Buscar dados da aula
    const { data: classData, error: classError } = await supabaseClient
      .from('classes')
      .select('id, class_date, teacher_id, service_id')
      .eq('id', class_id)
      .maybeSingle();

    if (classError || !classData) {
      throw new Error(`Aula não encontrada: ${classError?.message || 'ID inválido'}`);
    }

    // 2. Buscar professor separadamente
    const { data: teacher, error: teacherError } = await supabaseClient
      .from('profiles')
      .select('id, name, email')
      .eq('id', classData.teacher_id)
      .maybeSingle();

    if (teacherError) {
      console.error('Erro ao buscar professor:', teacherError);
    }

    // 3. Buscar serviço separadamente (se existir)
    let service = null;
    if (classData.service_id) {
      const { data: serviceData } = await supabaseClient
        .from('class_services')
        .select('name, price')
        .eq('id', classData.service_id)
        .maybeSingle();
      service = serviceData;
    }

    // 4. Buscar participantes separadamente (incluindo dependent_id)
    const { data: participantsData, error: participantsError } = await supabaseClient
      .from('class_participants')
      .select('student_id, dependent_id')
      .eq('class_id', class_id);

    if (participantsError) {
      console.error('Erro ao buscar participantes:', participantsError);
    }

    // 5. Buscar perfis dos participantes e nomes de dependentes
    const class_participants: Array<{
      student_id: string;
      dependent_id?: string;
      dependent_name?: string;
      profiles: { id: string; name: string; email: string };
    }> = [];

    for (const p of (participantsData || [])) {
      const { data: studentProfile } = await supabaseClient
        .from('profiles')
        .select('id, name, email')
        .eq('id', p.student_id)
        .maybeSingle();
      
      if (studentProfile) {
        let dependentName = null;
        if (p.dependent_id) {
          const { data: dependent } = await supabaseClient
            .from('dependents')
            .select('name')
            .eq('id', p.dependent_id)
            .maybeSingle();
          dependentName = dependent?.name;
        }

        class_participants.push({
          student_id: p.student_id,
          dependent_id: p.dependent_id,
          dependent_name: dependentName,
          profiles: studentProfile
        });
      }
    }

    // Buscar student do primeiro participante (para compatibilidade com lógica existente)
    const firstParticipant = class_participants?.[0];
    const student = firstParticipant?.profiles;

    const classDateFormatted = new Date(classData.class_date).toLocaleString('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo'
    });

    // NEW: Buscar nome do dependente removido (se aplicável)
    let removedDependentName: string | null = null;
    if (removed_dependent_id) {
      const { data: removedDependent } = await supabaseClient
        .from('dependents')
        .select('name')
        .eq('id', removed_dependent_id)
        .maybeSingle();
      removedDependentName = removedDependent?.name || null;
    }

    console.log('🔍 NOTIFICATION DATA:', {
      source: participants.length > 0 ? 'REQUEST' : 'DATABASE',
      participants_from_request: participants.length,
      participants_from_db: class_participants.length,
      class_id,
      cancelled_by_type,
      charge_applied,
      is_group_class,
      notification_target,
      removed_student_id,
      removed_dependent_id,
      removed_dependent_name: removedDependentName,
      teacher: teacher?.email,
      student: student?.email
    });

    // Preparar conteúdo do email
    const classTypeLabel = is_group_class ? 'aula em grupo' : 'aula';
    const emailsToSend: Array<{ to: string; subject: string; html: string; student_id?: string }> = [];

    // Caso especial: notificar professor sobre saída de participante
    if (notification_target === 'teacher' && removed_student_id) {
      const { data: removedStudent } = await supabaseClient
        .from('profiles')
        .select('name, email')
        .eq('id', removed_student_id)
        .maybeSingle();

      // Verificar preferências do professor
      const { data: teacherPrefs } = await supabaseClient
        .from('profiles')
        .select('notification_preferences')
        .eq('id', classData.teacher_id)
        .maybeSingle();

      const preferences = teacherPrefs?.notification_preferences || {};
      if (preferences.class_cancelled === false) {
        console.log('⏭️ Teacher has disabled class_cancelled notifications, skipping.');
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'preferences_disabled' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const recipientEmail = teacher?.email || '';
      
      // Determinar nome do aluno (dependente ou normal)
      const studentDisplayName = removedDependentName 
        ? `${removedDependentName} (dependente de ${removedStudent?.name})`
        : removedStudent?.name;
      
      const subject = removedDependentName 
        ? `Dependente ${removedDependentName} saiu da aula em grupo`
        : `Aluno saiu da aula em grupo`;
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Participante Removido da Aula em Grupo</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Aluno:</strong> ${removedDependentName || removedStudent?.name}${removedDependentName ? ' <span style="color: #7c3aed;">(dependente)</span>' : ''}</p>
            ${removedDependentName ? `<p><strong>Responsável:</strong> ${removedStudent?.name}</p>` : ''}
            <p><strong>Data/Hora:</strong> ${classDateFormatted}</p>
            ${service ? `<p><strong>Serviço:</strong> ${service.name}</p>` : ''}
            <p><strong>Motivo:</strong> ${cancellation_reason}</p>
          </div>

          ${charge_applied ? `
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #991b1b;">
                <strong>⚠️ Cobrança Aplicada ${removedDependentName ? 'ao Responsável' : 'ao Aluno'}:</strong><br>
                O cancelamento foi fora do prazo e será incluído na próxima fatura mensal.
              </p>
            </div>
          ` : `
            <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #166534;">
                <strong>✓ Cancelamento Gratuito:</strong><br>
                O cancelamento foi dentro do prazo estabelecido.
              </p>
            </div>
          `}

          <div style="background: #fef9c3; border-left: 4px solid #facc15; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #713f12;">
              <strong>ℹ️ Aula Continua:</strong><br>
              A aula continua normalmente para os outros participantes.
            </p>
          </div>

          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Esta é uma notificação automática do Tutor Flow.
          </p>
        </div>
      `;

      if (recipientEmail) {
        emailsToSend.push({ to: recipientEmail, subject, html: htmlContent });
      }
    } else if (cancelled_by_type === 'student') {
      // Verificar preferências do professor
      const { data: teacherPrefs } = await supabaseClient
        .from('profiles')
        .select('notification_preferences')
        .eq('id', classData.teacher_id)
        .maybeSingle();

      const preferences = teacherPrefs?.notification_preferences || {};
      if (preferences.class_cancelled === false) {
        console.log('⏭️ Teacher has disabled class_cancelled notifications, skipping.');
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'preferences_disabled' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Determinar nome do aluno (pode ser dependente)
      const firstParticipantDep = participants[0];
      let cancellerDisplayName = student?.name || 'Aluno';
      
      // Verificar se há dependente no primeiro participante da request
      if (firstParticipantDep?.dependent_id) {
        const { data: depData } = await supabaseClient
          .from('dependents')
          .select('name')
            .eq('id', firstParticipantDep.dependent_id)
            .maybeSingle();
        if (depData) {
          cancellerDisplayName = `${depData.name} (dependente)`;
        }
      }

      // Notificar professor que aluno cancelou
      const recipientEmail = teacher?.email || '';
      const subject = `${is_group_class ? 'Aula em Grupo' : 'Aula'} Cancelada - ${cancellerDisplayName}`;
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">${classTypeLabel.charAt(0).toUpperCase() + classTypeLabel.slice(1)} Cancelada pelo Aluno</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Aluno:</strong> ${cancellerDisplayName}</p>
            ${is_group_class ? `<p><strong>Tipo:</strong> Aula em Grupo (${participants.length} participantes)</p>` : ''}
            <p><strong>Data/Hora:</strong> ${classDateFormatted}</p>
            ${service ? `<p><strong>Serviço:</strong> ${service.name}</p>` : ''}
            <p><strong>Motivo:</strong> ${cancellation_reason}</p>
          </div>

          ${charge_applied ? `
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #991b1b;">
                <strong>⚠️ Cobrança Aplicada:</strong><br>
                O cancelamento foi fora do prazo e será incluído na próxima fatura mensal.
              </p>
            </div>
          ` : `
            <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #166534;">
                <strong>✓ Cancelamento Gratuito:</strong><br>
                O cancelamento foi dentro do prazo estabelecido.
              </p>
            </div>
          `}

          ${is_group_class ? `
            <div style="background: #fef9c3; border-left: 4px solid #facc15; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #713f12;">
                <strong>ℹ️ Aula em Grupo:</strong><br>
                Os demais participantes foram notificados sobre o cancelamento.
              </p>
            </div>
          ` : ''}

          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Esta é uma notificação automática do Tutor Flow.
          </p>
        </div>
      `;

      if (recipientEmail) {
        emailsToSend.push({ to: recipientEmail, subject, html: htmlContent });
      }
    } else {
      // Notificar aluno(s) que professor cancelou
      // SEMPRE priorizar participants da request (para todos os tipos de aula)
      const studentsToNotify = participants.length > 0
        ? participants
        : class_participants.map(p => ({
            student_id: p.student_id,
            dependent_id: p.dependent_id,
            profile: p.profiles
          }));

      console.log('📊 Students to notify:', {
        using_source: participants.length > 0 ? 'REQUEST' : 'DATABASE',
        count: studentsToNotify.length,
        emails: studentsToNotify.map(s => s.profile?.email || 'NO_EMAIL')
      });

      for (const participantData of studentsToNotify) {
        const studentProfile = participantData.profile;
        if (!studentProfile) continue;

        // Verificar preferências do aluno/responsável
        const { data: studentPrefs } = await supabaseClient
          .from('profiles')
          .select('notification_preferences')
          .eq('id', participantData.student_id)
          .maybeSingle();

        const preferences = studentPrefs?.notification_preferences || {};
        if (preferences.class_cancelled === false) {
          console.log(`⏭️ Student ${participantData.student_id} has disabled class_cancelled notifications, skipping.`);
          continue;
        }

        // NEW: Buscar nome do dependente se aplicável
        let dependentName: string | null = null;
        if (participantData.dependent_id) {
          const { data: depData } = await supabaseClient
            .from('dependents')
            .select('name')
            .eq('id', participantData.dependent_id)
            .maybeSingle();
          dependentName = depData?.name || null;
        }

        const recipientEmail = studentProfile.email || '';
        if (!recipientEmail) continue;

        const subject = dependentName 
          ? `Aula de ${dependentName} Cancelada - ${teacher?.name || 'Professor'}`
          : `${classTypeLabel.charAt(0).toUpperCase() + classTypeLabel.slice(1)} Cancelada - ${teacher?.name || 'Professor'}`;
        
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">${dependentName ? `Aula de ${dependentName} Cancelada` : `${classTypeLabel.charAt(0).toUpperCase() + classTypeLabel.slice(1)} Cancelada pelo Professor`}</h2>
            
            ${dependentName ? `
              <div style="background: #ede9fe; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; display: inline-block;">
                <span style="color: #7c3aed; font-weight: 500;">📌 Cancelamento da aula de ${dependentName}</span>
              </div>
            ` : ''}
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Professor:</strong> ${teacher?.name}</p>
              ${dependentName ? `<p><strong>Aluno:</strong> ${dependentName} <span style="color: #7c3aed;">(dependente)</span></p>` : ''}
              ${is_group_class ? `<p><strong>Tipo:</strong> Aula em Grupo (${participants.length} participantes)</p>` : ''}
              <p><strong>Data/Hora:</strong> ${classDateFormatted}</p>
              ${service ? `<p><strong>Serviço:</strong> ${service.name}</p>` : ''}
              <p><strong>Motivo:</strong> ${cancellation_reason}</p>
            </div>

            <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #166534;">
                <strong>✓ Sem Cobrança:</strong><br>
                Cancelamentos realizados pelo professor não geram cobrança.
              </p>
            </div>

            <p>Entre em contato com ${teacher?.name} se tiver dúvidas sobre o cancelamento.</p>

            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              Esta é uma notificação automática do Tutor Flow.
            </p>
          </div>
        `;

        emailsToSend.push({ to: recipientEmail, subject, html: htmlContent, student_id: participantData.student_id });
      }
    }

    // Enviar emails via AWS SES
    if (emailsToSend.length === 0) {
      console.warn('No valid email addresses to send notifications');
      return new Response(JSON.stringify({ 
        success: true,
        message: 'No valid email addresses found'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const emailResults: Array<{ email: string; success: boolean; error?: string }> = [];

    for (const emailData of emailsToSend) {
      try {
        console.log(`📧 Enviando email para: ${emailData.to}`);
        
        const emailResult = await sendEmail({
          to: emailData.to,
          subject: emailData.subject,
          html: emailData.html,
        });

        if (!emailResult.success) {
          console.error(`❌ Erro ao enviar email para ${emailData.to}:`, emailResult.error);
          emailResults.push({ email: emailData.to, success: false, error: emailResult.error });
        } else {
          console.log(`✅ Email enviado com sucesso para ${emailData.to}`);
          emailResults.push({ email: emailData.to, success: true });
          
          // Registrar notificação no banco
          await supabaseClient
            .from('class_notifications')
            .insert({
              class_id: class_id,
              student_id: emailData.student_id || (notification_target === 'teacher' 
                ? classData.teacher_id
                : class_participants?.[0]?.student_id || null),
              notification_type: 'class_cancelled',
              status: 'sent'
            });
        }
      } catch (emailError) {
        console.error(`❌ Exceção ao enviar email para ${emailData.to}:`, emailError);
        emailResults.push({ 
          email: emailData.to, 
          success: false, 
          error: emailError instanceof Error ? emailError.message : 'Unknown error' 
        });
      }
    }

    const successCount = emailResults.filter(r => r.success).length;
    const failedCount = emailResults.length - successCount;

    return new Response(JSON.stringify({ 
      success: successCount > 0,
      message: `Sent ${successCount}/${emailResults.length} notifications${failedCount > 0 ? ` (${failedCount} failed)` : ''}`,
      results: emailResults
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error('Error sending cancellation notification:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

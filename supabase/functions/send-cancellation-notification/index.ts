import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  notification_target?: 'teacher' | 'students'; // NOVO
  removed_student_id?: string; // NOVO
  participants?: Array<{
    student_id: string;
    profile: {
      name: string;
      email: string;
      guardian_email?: string;
    };
  }>;
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

    const { 
      class_id, 
      cancelled_by_type, 
      charge_applied, 
      cancellation_reason,
      is_group_class = false,
      notification_target,
      removed_student_id,
      participants = []
    }: NotificationRequest = await req.json();

    // Buscar detalhes da aula
    const { data: classData, error: classError } = await supabaseClient
      .from('classes')
      .select(`
        id,
        class_date,
        teacher:profiles!classes_teacher_id_fkey(name, email),
        service:class_services(name, price),
        class_participants!inner (
          student_id,
          profiles!class_participants_student_id_fkey (
            id,
            name,
            email,
            guardian_email
          )
        )
      `)
      .eq('id', class_id)
      .maybeSingle();

    if (classError || !classData) {
      throw new Error('Aula não encontrada');
    }

    const teacher = Array.isArray(classData.teacher) ? classData.teacher[0] : classData.teacher;
    const service = Array.isArray(classData.service) ? classData.service[0] : classData.service;
    
    // Buscar student do primeiro participante (para compatibilidade com lógica existente)
    const firstParticipant = classData.class_participants?.[0];
    const student = firstParticipant?.profiles;

    const classDateFormatted = new Date(classData.class_date).toLocaleString('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo'
    });

    console.log('Sending cancellation notification:', {
      class_id,
      cancelled_by_type,
      charge_applied,
      is_group_class,
      notification_target,
      removed_student_id,
      participants_count: participants.length,
      teacher: teacher?.email,
      student: student?.email
    });

    // Preparar conteúdo do email
    const classTypeLabel = is_group_class ? 'aula em grupo' : 'aula';
    const emailsToSend: Array<{ to: string; subject: string; html: string }> = [];

    // Caso especial: notificar professor sobre saída de participante
    if (notification_target === 'teacher' && removed_student_id) {
      const { data: removedStudent } = await supabaseClient
        .from('profiles')
        .select('name, email')
        .eq('id', removed_student_id)
        .maybeSingle();

      const recipientEmail = teacher?.email || '';
      const subject = `Aluno saiu da aula em grupo`;
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Participante Removido da Aula em Grupo</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Aluno:</strong> ${removedStudent?.name}</p>
            <p><strong>Data/Hora:</strong> ${classDateFormatted}</p>
            ${service ? `<p><strong>Serviço:</strong> ${service.name}</p>` : ''}
            <p><strong>Motivo:</strong> ${cancellation_reason}</p>
          </div>

          ${charge_applied ? `
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #991b1b;">
                <strong>⚠️ Cobrança Aplicada ao Aluno:</strong><br>
                O cancelamento foi fora do prazo e será incluído na próxima fatura mensal do aluno.
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
      // Notificar professor que aluno cancelou
      const recipientEmail = teacher?.email || '';
      const subject = `${is_group_class ? 'Aula em Grupo' : 'Aula'} Cancelada - ${student?.name || 'Aluno'}`;
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">${classTypeLabel.charAt(0).toUpperCase() + classTypeLabel.slice(1)} Cancelada pelo Aluno</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Aluno:</strong> ${student?.name}</p>
            ${is_group_class ? `<p><strong>Tipo:</strong> Aula em Grupo (${participants.length} participantes)</p>` : ''}
            <p><strong>Data/Hora:</strong> ${classDateFormatted}</p>
            ${service ? `<p><strong>Serviço:</strong> ${service.name}</p>` : ''}
            <p><strong>Motivo:</strong> ${cancellation_reason}</p>
          </div>

          ${charge_applied ? `
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #991b1b;">
                <strong>⚠️ Cobrança Aplicada:</strong><br>
                O cancelamento foi fora do prazo e será incluído na próxima fatura mensal do aluno.
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
      const studentsToNotify = is_group_class 
        ? participants 
        : classData.class_participants.map(p => ({
            student_id: p.student_id,
            profile: p.profiles
          }));

      for (const participantData of studentsToNotify) {
        const studentProfile = participantData.profile;
        if (!studentProfile) continue;

        const recipientEmail = studentProfile.guardian_email || studentProfile.email || '';
        if (!recipientEmail) continue;

        const subject = `${classTypeLabel.charAt(0).toUpperCase() + classTypeLabel.slice(1)} Cancelada - ${teacher?.name || 'Professor'}`;
        
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">${classTypeLabel.charAt(0).toUpperCase() + classTypeLabel.slice(1)} Cancelada pelo Professor</h2>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Professor:</strong> ${teacher?.name}</p>
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

        emailsToSend.push({ to: recipientEmail, subject, html: htmlContent });
      }
    }

    // Enviar emails via Resend
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

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.warn('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Email notifications skipped (RESEND_API_KEY not configured)'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const emailResults: Array<{ email: string; success: boolean; error?: string }> = [];

    for (const emailData of emailsToSend) {
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Tutor Flow <noreply@tutorflow.app>',
            to: emailData.to,
            subject: emailData.subject,
            html: emailData.html,
          }),
        });

        if (!resendResponse.ok) {
          const errorText = await resendResponse.text();
          console.error(`Resend API error for ${emailData.to}:`, errorText);
          emailResults.push({ email: emailData.to, success: false, error: errorText });
        } else {
          console.log(`Email sent successfully to ${emailData.to}`);
          emailResults.push({ email: emailData.to, success: true });
        }
      } catch (emailError) {
        console.error(`Error sending email to ${emailData.to}:`, emailError);
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

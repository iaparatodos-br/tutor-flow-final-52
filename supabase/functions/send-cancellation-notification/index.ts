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

    const { class_id, cancelled_by_type, charge_applied, cancellation_reason }: NotificationRequest = await req.json();

    // Buscar detalhes da aula
    const { data: classData, error: classError } = await supabaseClient
      .from('classes')
      .select(`
        id,
        class_date,
        teacher:profiles!classes_teacher_id_fkey(name, email),
        student:profiles!classes_student_id_fkey(name, email, guardian_email),
        service:class_services(name, price)
      `)
      .eq('id', class_id)
      .maybeSingle();

    if (classError || !classData) {
      throw new Error('Aula não encontrada');
    }

    const teacher = Array.isArray(classData.teacher) ? classData.teacher[0] : classData.teacher;
    const student = Array.isArray(classData.student) ? classData.student[0] : classData.student;
    const service = Array.isArray(classData.service) ? classData.service[0] : classData.service;

    const classDateFormatted = new Date(classData.class_date).toLocaleString('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo'
    });

    console.log('Sending cancellation notification:', {
      class_id,
      cancelled_by_type,
      charge_applied,
      teacher: teacher?.email,
      student: student?.email
    });

    // Preparar conteúdo do email
    let subject: string;
    let htmlContent: string;
    let recipientEmail: string;

    if (cancelled_by_type === 'student') {
      // Notificar professor que aluno cancelou
      recipientEmail = teacher?.email || '';
      subject = `Aula Cancelada - ${student?.name || 'Aluno'}`;
      
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Aula Cancelada pelo Aluno</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Aluno:</strong> ${student?.name}</p>
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

          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Esta é uma notificação automática do Tutor Flow.
          </p>
        </div>
      `;
    } else {
      // Notificar aluno que professor cancelou
      recipientEmail = student?.guardian_email || student?.email || '';
      subject = `Aula Cancelada - ${teacher?.name || 'Professor'}`;
      
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Aula Cancelada pelo Professor</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Professor:</strong> ${teacher?.name}</p>
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
    }

    // Enviar email via Resend
    if (recipientEmail && Deno.env.get("RESEND_API_KEY")) {
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Tutor Flow <noreply@tutorflow.app>',
            to: recipientEmail,
            subject: subject,
            html: htmlContent,
          }),
        });

        if (!resendResponse.ok) {
          const errorText = await resendResponse.text();
          console.error('Resend API error:', errorText);
          throw new Error('Falha ao enviar email');
        }

        console.log('Cancellation notification email sent successfully');
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        // Não falhar a operação se o email falhar
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Notificação de cancelamento enviada'
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

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConfirmationNotificationPayload {
  class_id: string;
  teacher_id: string;
  student_id: string;
  service_name: string;
  class_date: string;
  duration_minutes: number;
  teacher_name: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const payload: ConfirmationNotificationPayload = await req.json();
    console.log("📬 Processing class confirmation notification:", payload);

    // 1. Buscar dados do aluno
    const { data: student, error: studentError } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", payload.student_id)
      .single();

    if (studentError || !student?.email) {
      console.error("Student not found or no email:", studentError);
      throw new Error("Student not found or no email");
    }

    // 2. Buscar dados do relacionamento para pegar email do responsável (se houver)
    const { data: relationship } = await supabase
      .from("teacher_student_relationships")
      .select("student_guardian_email, student_guardian_name")
      .eq("teacher_id", payload.teacher_id)
      .eq("student_id", payload.student_id)
      .single();

    // Definir destinatário: responsável se existir, senão o próprio aluno
    const recipientEmail = relationship?.student_guardian_email || student.email;
    const recipientName = relationship?.student_guardian_name || student.name;

    // 3. Formatar data e hora
    const classDateTime = new Date(payload.class_date);
    const formattedDate = classDateTime.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
    const formattedTime = classDateTime.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });

    // 4. Construir email
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>✅ Aula Confirmada!</h2>
            </div>
            <div class="content">
              <p>Olá <strong>${recipientName}</strong>,</p>
              
              <p>O professor <strong>${payload.teacher_name}</strong> confirmou a aula solicitada!</p>
              
              <div class="info-box">
                <h3 style="margin-top: 0;">📋 Detalhes da Aula</h3>
                <p><strong>Serviço:</strong> ${payload.service_name}</p>
                <p><strong>Data:</strong> ${formattedDate}</p>
                <p><strong>Horário:</strong> ${formattedTime}</p>
                <p><strong>Duração:</strong> ${payload.duration_minutes} minutos</p>
                <p><strong>Professor:</strong> ${payload.teacher_name}</p>
              </div>
              
              <p style="text-align: center; margin: 30px 0;">
                <a href="${Deno.env.get("SITE_URL")}/agenda" class="button">
                  Ver na Minha Agenda
                </a>
              </p>
              
              <p style="font-size: 14px; color: #6b7280;">
                💡 <strong>Lembrete:</strong> A aula está confirmada! Prepare-se para aproveitar ao máximo este momento de aprendizado.
              </p>
            </div>
            <div class="footer">
              <p>Tutor Flow - Sistema de Gestão de Aulas</p>
              <p>Este é um email automático, não responda.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // 5. Enviar email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Tutor Flow <noreply@tutor-flow.app>",
      to: [recipientEmail],
      subject: `✅ Aula confirmada com ${payload.teacher_name}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("❌ Error sending email:", emailError);
      throw emailError;
    }

    console.log("✅ Email sent successfully:", emailData);

    // 6. Registrar notificação no histórico
    const { error: notificationError } = await supabase
      .from("class_notifications")
      .insert({
        class_id: payload.class_id,
        student_id: payload.student_id,
        notification_type: "class_confirmed",
        status: "sent",
      });

    if (notificationError) {
      console.error("⚠️ Error saving notification (non-critical):", notificationError);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Notification sent" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("❌ Error in send-class-confirmation-notification:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

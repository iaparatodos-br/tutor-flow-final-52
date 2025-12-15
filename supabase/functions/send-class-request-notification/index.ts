import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/ses-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestNotificationPayload {
  class_id: string;
  teacher_id: string;
  student_id: string;
  dependent_id?: string; // NEW: Support for dependent
  service_name: string;
  class_date: string;
  duration_minutes: number;
  notes?: string;
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

    const payload: RequestNotificationPayload = await req.json();
    console.log("📬 Processing class request notification:", payload);

    // 1. Buscar dados do professor
    const { data: teacher, error: teacherError } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", payload.teacher_id)
      .single();

    if (teacherError || !teacher?.email) {
      console.error("Teacher not found or no email:", teacherError);
      throw new Error("Teacher not found or no email");
    }

    // 2. Buscar dados do aluno/responsável
    const { data: student, error: studentError } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", payload.student_id)
      .single();

    if (studentError || !student) {
      console.error("Student not found:", studentError);
      throw new Error("Student not found");
    }

    // 3. NEW: Buscar dados do dependente se aplicável
    let dependentName: string | null = null;
    if (payload.dependent_id) {
      const { data: dependent } = await supabase
        .from("dependents")
        .select("name")
        .eq("id", payload.dependent_id)
        .single();
      
      if (dependent) {
        dependentName = dependent.name;
        console.log(`📌 Aula solicitada para dependente: ${dependentName}`);
      }
    }

    // Determinar nome do aluno para exibição
    const displayStudentName = dependentName 
      ? `${dependentName} (dependente de ${student.name})`
      : student.name;

    // 4. Formatar data e hora
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

    // 5. Construir email
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .notes { background: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0; }
            .dependent-badge { background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 9999px; font-size: 12px; display: inline-block; margin-left: 8px; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>🔔 Nova Solicitação de Aula</h2>
            </div>
            <div class="content">
              <p>Olá <strong>${teacher.name}</strong>,</p>
              
              <p>${dependentName 
                ? `O responsável <strong>${student.name}</strong> solicitou uma aula para o dependente <strong>${dependentName}</strong>!`
                : `O aluno <strong>${student.name}</strong> solicitou uma aula com você!`
              }</p>
              
              <div class="info-box">
                <h3 style="margin-top: 0;">📋 Detalhes da Aula</h3>
                <p><strong>Serviço:</strong> ${payload.service_name}</p>
                <p><strong>Data:</strong> ${formattedDate}</p>
                <p><strong>Horário:</strong> ${formattedTime}</p>
                <p><strong>Duração:</strong> ${payload.duration_minutes} minutos</p>
                <p><strong>Aluno:</strong> ${dependentName || student.name}${dependentName ? `<span class="dependent-badge">📌 Dependente</span>` : ''}</p>
                ${dependentName ? `<p><strong>Responsável:</strong> ${student.name} (${student.email})</p>` : `<p><strong>Email:</strong> ${student.email}</p>`}
              </div>
              
              ${payload.notes ? `
                <div class="notes">
                  <h4 style="margin-top: 0;">💬 Observações:</h4>
                  <p>${payload.notes}</p>
                </div>
              ` : ""}
              
              <p style="text-align: center; margin: 30px 0;">
                <a href="${Deno.env.get("SITE_URL")}/agenda" class="button">
                  Ver na Agenda e Confirmar
                </a>
              </p>
              
              <p style="font-size: 14px; color: #6b7280;">
                ⏰ <strong>Ação necessária:</strong> Acesse sua agenda para confirmar ou reagendar esta aula.
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

    // 6. Enviar email
    const emailResult = await sendEmail({
      to: teacher.email,
      subject: `🔔 Nova solicitação de aula ${dependentName ? `para ${dependentName}` : `de ${student.name}`}`,
      html: emailHtml,
    });

    if (!emailResult.success) {
      console.error("❌ Error sending email:", emailResult.error);
      throw new Error(emailResult.error);
    }

    console.log("✅ Email sent successfully:", emailResult.messageId);

    // 7. Registrar notificação no histórico
    const { error: notificationError } = await supabase
      .from("class_notifications")
      .insert({
        class_id: payload.class_id,
        student_id: payload.student_id,
        notification_type: "class_requested",
        status: "sent",
      });

    if (notificationError) {
      console.error("⚠️ Error saving notification (non-critical):", notificationError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Notification sent",
        dependent_name: dependentName
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("❌ Error in send-class-request-notification:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

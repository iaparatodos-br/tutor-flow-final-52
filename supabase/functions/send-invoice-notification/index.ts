import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceNotificationPayload {
  invoice_id: string;
  notification_type: 'invoice_created' | 'invoice_payment_reminder' | 'invoice_paid' | 'invoice_overdue';
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

    const payload: InvoiceNotificationPayload = await req.json();
    console.log("💰 Processing invoice notification:", payload);

    // 1. Buscar dados da fatura
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id,
        amount,
        due_date,
        status,
        description,
        student_id,
        teacher_id,
        stripe_hosted_invoice_url,
        boleto_url,
        pix_qr_code,
        pix_copy_paste
      `)
      .eq("id", payload.invoice_id)
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice not found:", invoiceError);
      throw new Error("Invoice not found");
    }

    // 2. Buscar dados do aluno e preferências
    const { data: student, error: studentError } = await supabase
      .from("profiles")
      .select("name, email, notification_preferences")
      .eq("id", invoice.student_id)
      .single();

    if (studentError || !student) {
      console.error("Student not found:", studentError);
      throw new Error("Student not found");
    }

    // Verificar preferências de notificação
    const preferences = student.notification_preferences as any;
    const preferenceMap: Record<string, string> = {
      'invoice_created': 'invoice_created',
      'invoice_payment_reminder': 'invoice_payment_reminder',
      'invoice_paid': 'invoice_paid',
      'invoice_overdue': 'invoice_overdue'
    };

    const preferenceKey = preferenceMap[payload.notification_type];
    if (preferences?.[preferenceKey] === false) {
      console.log(`⏭️ Aluno ${invoice.student_id} desabilitou notificações do tipo ${payload.notification_type}`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "User preference disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // 3. Buscar dados do professor
    const { data: teacher, error: teacherError } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", invoice.teacher_id)
      .single();

    if (teacherError || !teacher) {
      console.error("Teacher not found:", teacherError);
      throw new Error("Teacher not found");
    }

    // 4. Buscar relacionamento para email do responsável
    const { data: relationship } = await supabase
      .from("teacher_student_relationships")
      .select("student_guardian_email, student_guardian_name")
      .eq("teacher_id", invoice.teacher_id)
      .eq("student_id", invoice.student_id)
      .maybeSingle();

    const recipientEmail = relationship?.student_guardian_email || student.email;
    const recipientName = relationship?.student_guardian_name || student.name;

    // 5. Formatar valores
    const formattedAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(invoice.amount));

    const formattedDueDate = new Date(invoice.due_date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });

    // 6. Construir conteúdo do email baseado no tipo
    let subject = "";
    let headerColor = "";
    let icon = "";
    let title = "";
    let mainMessage = "";
    let ctaButton = "";

    switch (payload.notification_type) {
      case 'invoice_created':
        subject = `💵 Nova fatura de ${teacher.name}`;
        headerColor = "#2563eb";
        icon = "💵";
        title = "Nova Fatura Disponível";
        mainMessage = `Uma nova fatura foi gerada pelo professor <strong>${teacher.name}</strong>.`;
        ctaButton = `<a href="${Deno.env.get("SITE_URL")}/faturas" class="button">Ver Fatura</a>`;
        break;

      case 'invoice_payment_reminder':
        subject = `⏰ Lembrete: Fatura vence em breve`;
        headerColor = "#f59e0b";
        icon = "⏰";
        title = "Lembrete de Pagamento";
        mainMessage = `Sua fatura com o professor <strong>${teacher.name}</strong> vence em breve.`;
        ctaButton = `<a href="${Deno.env.get("SITE_URL")}/faturas" class="button">Pagar Agora</a>`;
        break;

      case 'invoice_paid':
        subject = `✅ Pagamento confirmado`;
        headerColor = "#10b981";
        icon = "✅";
        title = "Pagamento Confirmado!";
        mainMessage = `Seu pagamento para o professor <strong>${teacher.name}</strong> foi confirmado com sucesso.`;
        ctaButton = `<a href="${Deno.env.get("SITE_URL")}/faturas" class="button">Ver Comprovante</a>`;
        break;

      case 'invoice_overdue':
        subject = `⚠️ Fatura vencida - Ação necessária`;
        headerColor = "#ef4444";
        icon = "⚠️";
        title = "Fatura Vencida";
        mainMessage = `Sua fatura com o professor <strong>${teacher.name}</strong> está vencida. Por favor, regularize o pagamento o quanto antes.`;
        ctaButton = `<a href="${Deno.env.get("SITE_URL")}/faturas" class="button">Pagar Agora</a>`;
        break;
    }

    // 7. Construir seção de métodos de pagamento
    let paymentMethods = '';
    if (invoice.stripe_hosted_invoice_url) {
      paymentMethods += `
        <p><strong>💳 Cartão de Crédito:</strong></p>
        <a href="${invoice.stripe_hosted_invoice_url}" class="payment-link">Pagar com Cartão</a>
      `;
    }
    if (invoice.pix_copy_paste) {
      paymentMethods += `
        <p style="margin-top: 15px;"><strong>📱 PIX:</strong></p>
        <div class="pix-code">${invoice.pix_copy_paste}</div>
        <small style="color: #6b7280;">Copie o código acima para pagar via PIX</small>
      `;
    }
    if (invoice.boleto_url) {
      paymentMethods += `
        <p style="margin-top: 15px;"><strong>📄 Boleto:</strong></p>
        <a href="${invoice.boleto_url}" class="payment-link">Gerar Boleto</a>
      `;
    }

    // 8. Construir email
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${headerColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${headerColor}; }
            .button { display: inline-block; background: ${headerColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .payment-link { display: inline-block; background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin: 5px 0; }
            .pix-code { background: #f3f4f6; padding: 15px; border-radius: 6px; font-family: monospace; word-break: break-all; margin: 10px 0; border: 2px dashed #d1d5db; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>${icon} ${title}</h2>
            </div>
            <div class="content">
              <p>Olá <strong>${recipientName}</strong>,</p>
              
              <p>${mainMessage}</p>
              
              <div class="info-box">
                <h3 style="margin-top: 0;">📋 Detalhes da Fatura</h3>
                <p><strong>Valor:</strong> ${formattedAmount}</p>
                <p><strong>Vencimento:</strong> ${formattedDueDate}</p>
                <p><strong>Descrição:</strong> ${invoice.description || 'Aulas realizadas'}</p>
                <p><strong>Professor:</strong> ${teacher.name}</p>
                <p><strong>Status:</strong> ${invoice.status}</p>
              </div>
              
              ${paymentMethods ? `
                <div class="info-box">
                  <h3 style="margin-top: 0;">💳 Formas de Pagamento</h3>
                  ${paymentMethods}
                </div>
              ` : ''}
              
              <p style="text-align: center; margin: 30px 0;">
                ${ctaButton}
              </p>
              
              <p style="font-size: 14px; color: #6b7280;">
                💡 <strong>Dúvidas?</strong> Entre em contato diretamente com ${teacher.name} (${teacher.email})
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

    // 9. Enviar email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Tutor Flow <noreply@tutor-flow.app>",
      to: [recipientEmail],
      subject: subject,
      html: emailHtml,
    });

    if (emailError) {
      console.error("❌ Error sending email:", emailError);
      throw emailError;
    }

    console.log("✅ Email sent successfully:", emailData);

    // 10. Registrar notificação
    const { error: notificationError } = await supabase
      .from("class_notifications")
      .insert({
        class_id: invoice.id, // Usando invoice_id como class_id para aproveitar a estrutura
        student_id: invoice.student_id,
        notification_type: payload.notification_type,
        status: "sent",
      });

    if (notificationError) {
      console.error("⚠️ Error saving notification (non-critical):", notificationError);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Invoice notification sent" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("❌ Error in send-invoice-notification:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

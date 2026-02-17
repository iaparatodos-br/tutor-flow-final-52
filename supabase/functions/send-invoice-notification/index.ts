import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/ses-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceNotificationPayload {
  invoice_id: string;
  notification_type: 'invoice_created' | 'invoice_payment_reminder' | 'invoice_paid' | 'invoice_overdue';
}

// Interface for monthly subscription details
interface MonthlySubscriptionDetails {
  name: string;
  price: number;
  max_classes: number | null;
  overage_price: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      supabaseServiceKey,
      { auth: { persistSession: false } }
    );

    // AUTH: Validate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header", success: false }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === supabaseServiceKey;
    if (!isServiceRole) {
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData.user) {
        return new Response(JSON.stringify({ error: "Authentication failed", success: false }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    const payload: InvoiceNotificationPayload = await req.json();
    console.log("💰 Processing invoice notification:", payload);

    // 1. Buscar dados da fatura (incluindo invoice_type e monthly_subscription_id)
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
        pix_copy_paste,
        invoice_type,
        monthly_subscription_id
      `)
      .eq("id", payload.invoice_id)
      .maybeSingle();

    if (invoiceError || !invoice) {
      console.error("Invoice not found:", invoiceError);
      throw new Error("Invoice not found");
    }

    // 2. Buscar dados do aluno/responsável e preferências
    const { data: student, error: studentError } = await supabase
      .from("profiles")
      .select("name, email, notification_preferences")
      .eq("id", invoice.student_id)
      .maybeSingle();

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
      .maybeSingle();

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

    // 5. Buscar itens da fatura para identificar dependentes e detalhes
    const { data: invoiceItems } = await supabase
      .from("invoice_classes")
      .select("description, amount, item_type, participant_id")
      .eq("invoice_id", payload.invoice_id);

    // Extrair nomes de dependentes das descrições (formato: [NomeDependente] Descrição)
    const dependentNames: string[] = [];
    if (invoiceItems && invoiceItems.length > 0) {
      for (const item of invoiceItems) {
        if (item.description && item.description.startsWith('[')) {
          const match = item.description.match(/^\[([^\]]+)\]/);
          if (match && match[1] && !dependentNames.includes(match[1])) {
            dependentNames.push(match[1]);
          }
        }
      }
    }

    const hasDependents = dependentNames.length > 0;
    console.log("📚 Invoice items analysis:", {
      itemCount: invoiceItems?.length || 0,
      dependentNames,
      hasDependents,
      invoiceType: invoice.invoice_type
    });

    // ===== FASE 6: LÓGICA ESPECIAL PARA MENSALIDADES (Tarefas 6.6-6.8) =====
    const isMonthlySubscription = invoice.invoice_type === 'monthly_subscription';
    let subscriptionDetails: MonthlySubscriptionDetails | null = null;
    let monthlySubscriptionInfo = {
      name: '',
      classesUsed: 0,
      maxClasses: null as number | null,
      overageCount: 0,
      overageTotal: 0
    };

    if (isMonthlySubscription && invoice.monthly_subscription_id) {
      // Buscar detalhes da mensalidade (Tarefa 6.7)
      const { data: subscription, error: subError } = await supabase
        .from("monthly_subscriptions")
        .select("name, price, max_classes, overage_price")
        .eq("id", invoice.monthly_subscription_id)
        .maybeSingle();

      if (!subError && subscription) {
        subscriptionDetails = subscription;
        monthlySubscriptionInfo.name = subscription.name;
        monthlySubscriptionInfo.maxClasses = subscription.max_classes;

        console.log("📦 Monthly subscription details:", subscriptionDetails);

        // Extrair informações de excedentes dos itens (Tarefa 6.8)
        if (invoiceItems) {
          const overageItem = invoiceItems.find(item => item.item_type === 'overage');
          if (overageItem) {
            // Parse overage count from description (ex: "Excedente: 2 aulas além do limite (4)")
            const overageMatch = overageItem.description?.match(/Excedente:\s*(\d+)\s*aula/);
            if (overageMatch) {
              monthlySubscriptionInfo.overageCount = parseInt(overageMatch[1], 10);
              monthlySubscriptionInfo.overageTotal = overageItem.amount;
            }
          }

          // Count classes from description if available
          const baseItem = invoiceItems.find(item => item.item_type === 'monthly_base');
          if (baseItem) {
            const classesMatch = invoice.description?.match(/\((\d+)\/(\d+)\s*aulas\)/);
            if (classesMatch) {
              monthlySubscriptionInfo.classesUsed = parseInt(classesMatch[1], 10);
            }
          }
        }
      }
    }

    // 6. Formatar valores
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

    // 7. Construir conteúdo do email baseado no tipo
    let subject = "";
    let headerColor = "";
    let icon = "";
    let title = "";
    let mainMessage = "";
    let ctaButton = "";

    // Construir sufixo para subject
    let subjectSuffix = '';
    if (isMonthlySubscription && subscriptionDetails) {
      subjectSuffix = ` - ${subscriptionDetails.name}`;
    } else if (hasDependents) {
      subjectSuffix = ` (${dependentNames.join(', ')})`;
    }

    switch (payload.notification_type) {
      case 'invoice_created':
        if (isMonthlySubscription && subscriptionDetails) {
          subject = `📦 Mensalidade ${subscriptionDetails.name} - ${teacher.name}`;
          headerColor = "#7c3aed"; // Purple for subscriptions
          icon = "📦";
          title = "Fatura de Mensalidade";
          mainMessage = `Sua fatura de mensalidade <strong>${subscriptionDetails.name}</strong> do professor <strong>${teacher.name}</strong> foi gerada.`;
        } else {
          subject = `💵 Nova fatura de ${teacher.name}${subjectSuffix}`;
          headerColor = "#2563eb";
          icon = "💵";
          title = "Nova Fatura Disponível";
          mainMessage = hasDependents
            ? `Uma nova fatura foi gerada pelo professor <strong>${teacher.name}</strong> referente às aulas de <strong>${dependentNames.join(', ')}</strong>.`
            : `Uma nova fatura foi gerada pelo professor <strong>${teacher.name}</strong>.`;
        }
        ctaButton = `<a href="${Deno.env.get("SITE_URL")}/faturas" class="button">Ver Fatura</a>`;
        break;

      case 'invoice_payment_reminder':
        subject = `⏰ Lembrete: Fatura vence em breve${subjectSuffix}`;
        headerColor = "#f59e0b";
        icon = "⏰";
        title = "Lembrete de Pagamento";
        if (isMonthlySubscription && subscriptionDetails) {
          mainMessage = `Sua fatura de mensalidade <strong>${subscriptionDetails.name}</strong> com o professor <strong>${teacher.name}</strong> vence em breve.`;
        } else {
          mainMessage = hasDependents
            ? `Sua fatura referente às aulas de <strong>${dependentNames.join(', ')}</strong> com o professor <strong>${teacher.name}</strong> vence em breve.`
            : `Sua fatura com o professor <strong>${teacher.name}</strong> vence em breve.`;
        }
        ctaButton = `<a href="${Deno.env.get("SITE_URL")}/faturas" class="button">Pagar Agora</a>`;
        break;

      case 'invoice_paid':
        subject = `✅ Pagamento confirmado${subjectSuffix}`;
        headerColor = "#10b981";
        icon = "✅";
        title = "Pagamento Confirmado!";
        if (isMonthlySubscription && subscriptionDetails) {
          mainMessage = `Seu pagamento da mensalidade <strong>${subscriptionDetails.name}</strong> para o professor <strong>${teacher.name}</strong> foi confirmado com sucesso.`;
        } else {
          mainMessage = hasDependents
            ? `Seu pagamento referente às aulas de <strong>${dependentNames.join(', ')}</strong> para o professor <strong>${teacher.name}</strong> foi confirmado com sucesso.`
            : `Seu pagamento para o professor <strong>${teacher.name}</strong> foi confirmado com sucesso.`;
        }
        ctaButton = `<a href="${Deno.env.get("SITE_URL")}/faturas" class="button">Ver Comprovante</a>`;
        break;

      case 'invoice_overdue':
        subject = `⚠️ Fatura vencida - Ação necessária${subjectSuffix}`;
        headerColor = "#ef4444";
        icon = "⚠️";
        title = "Fatura Vencida";
        if (isMonthlySubscription && subscriptionDetails) {
          mainMessage = `Sua fatura de mensalidade <strong>${subscriptionDetails.name}</strong> com o professor <strong>${teacher.name}</strong> está vencida. Por favor, regularize o pagamento o quanto antes.`;
        } else {
          mainMessage = hasDependents
            ? `Sua fatura referente às aulas de <strong>${dependentNames.join(', ')}</strong> com o professor <strong>${teacher.name}</strong> está vencida. Por favor, regularize o pagamento o quanto antes.`
            : `Sua fatura com o professor <strong>${teacher.name}</strong> está vencida. Por favor, regularize o pagamento o quanto antes.`;
        }
        ctaButton = `<a href="${Deno.env.get("SITE_URL")}/faturas" class="button">Pagar Agora</a>`;
        break;
    }

    // 8. Construir seção de métodos de pagamento
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

    // ===== SEÇÃO ESPECIAL PARA MENSALIDADES (Tarefa 6.8) =====
    let subscriptionSection = '';
    if (isMonthlySubscription && subscriptionDetails) {
      const formattedBasePrice = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(Number(subscriptionDetails.price));

      subscriptionSection = `
        <div class="subscription-box">
          <h3 style="margin-top: 0; color: #7c3aed;">📦 Detalhes do Plano</h3>
          <p><strong>Plano:</strong> ${subscriptionDetails.name}</p>
          <p><strong>Valor mensal:</strong> ${formattedBasePrice}</p>
          ${subscriptionDetails.max_classes !== null ? `
            <p><strong>Limite de aulas:</strong> ${subscriptionDetails.max_classes} aulas/mês</p>
            ${monthlySubscriptionInfo.classesUsed > 0 ? `
              <p><strong>Aulas utilizadas:</strong> ${monthlySubscriptionInfo.classesUsed} aulas</p>
            ` : ''}
          ` : `
            <p><strong>Aulas:</strong> Ilimitadas</p>
          `}
          ${monthlySubscriptionInfo.overageCount > 0 ? `
            <div class="overage-alert">
              <p style="margin: 0;"><strong>⚠️ Excedente:</strong> ${monthlySubscriptionInfo.overageCount} aula${monthlySubscriptionInfo.overageCount > 1 ? 's' : ''} além do limite</p>
              <p style="margin: 5px 0 0 0;"><strong>Valor adicional:</strong> ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(monthlySubscriptionInfo.overageTotal)}</p>
            </div>
          ` : ''}
        </div>
      `;
    }

    // 9. Construir email
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
            .subscription-box { background: #f5f3ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c3aed; }
            .overage-alert { background: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 10px; border: 1px solid #f59e0b; }
            .button { display: inline-block; background: ${headerColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .payment-link { display: inline-block; background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin: 5px 0; }
            .pix-code { background: #f3f4f6; padding: 15px; border-radius: 6px; font-family: monospace; word-break: break-all; margin: 10px 0; border: 2px dashed #d1d5db; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
            .dependent-badge { background: #ede9fe; color: #7c3aed; padding: 8px 16px; border-radius: 8px; display: inline-block; margin-bottom: 15px; }
            .subscription-badge { background: #7c3aed; color: white; padding: 8px 16px; border-radius: 8px; display: inline-block; margin-bottom: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>${icon} ${title}</h2>
            </div>
            <div class="content">
              <p>Olá <strong>${recipientName}</strong>,</p>
              
              ${isMonthlySubscription && subscriptionDetails ? `
                <div class="subscription-badge">
                  📦 Mensalidade: <strong>${subscriptionDetails.name}</strong>
                </div>
              ` : hasDependents ? `
                <div class="dependent-badge">
                  📌 Fatura referente a: <strong>${dependentNames.join(', ')}</strong>
                </div>
              ` : ''}
              
              <p>${mainMessage}</p>
              
              ${subscriptionSection}
              
              <div class="info-box">
                <h3 style="margin-top: 0;">📋 Detalhes da Fatura</h3>
                <p><strong>Valor total:</strong> ${formattedAmount}</p>
                <p><strong>Vencimento:</strong> ${formattedDueDate}</p>
                <p><strong>Descrição:</strong> ${invoice.description || 'Aulas realizadas'}</p>
                <p><strong>Professor:</strong> ${teacher.name}</p>
                ${hasDependents && !isMonthlySubscription ? `<p><strong>Alunos:</strong> ${dependentNames.join(', ')} <span style="color: #7c3aed;">(dependentes)</span></p>` : ''}
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

    // 10. Enviar email
    const emailResult = await sendEmail({
      to: recipientEmail,
      subject: subject,
      html: emailHtml,
    });

    if (!emailResult.success) {
      console.error("❌ Error sending email:", emailResult.error);
      throw new Error(emailResult.error);
    }

    console.log("✅ Email sent successfully:", emailResult.messageId);

    // 11. Registrar notificação
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

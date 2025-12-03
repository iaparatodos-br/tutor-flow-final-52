import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SESClient, SendEmailCommand } from "npm:@aws-sdk/client-ses@3.540.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  const d = details ? ` | ${JSON.stringify(details)}` : "";
  console.log(`[SEND-BOLETO-SUBSCRIPTION-NOTIFICATION] ${step}${d}`);
};

type NotificationType = 'boleto_generated' | 'boleto_reminder' | 'boleto_paid' | 'boleto_expired';

interface BoletoNotificationRequest {
  user_id: string;
  notification_type: NotificationType;
  boleto_url?: string;
  due_date?: string;
  amount?: number;
  barcode?: string;
  plan_name?: string;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value / 100);
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const getEmailTemplate = (type: NotificationType, data: any): { subject: string; html: string } => {
  const siteUrl = Deno.env.get("SITE_URL") || "https://www.tutor-flow.app";
  
  switch (type) {
    case 'boleto_generated':
      return {
        subject: `Boleto gerado para sua assinatura - Tutor Flow`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">💳 Boleto Gerado</h1>
              </div>
              <div style="padding: 30px;">
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  Olá <strong>${data.userName}</strong>,
                </p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  Seu boleto para o plano <strong>${data.planName}</strong> foi gerado com sucesso!
                </p>
                
                <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <h3 style="color: #166534; margin: 0 0 15px 0;">Detalhes do Pagamento</h3>
                  <p style="margin: 5px 0; color: #374151;"><strong>Valor:</strong> ${data.amount}</p>
                  <p style="margin: 5px 0; color: #374151;"><strong>Vencimento:</strong> ${data.dueDate}</p>
                  ${data.barcode ? `<p style="margin: 15px 0 5px 0; color: #374151;"><strong>Código de Barras:</strong></p>
                  <div style="background-color: #ffffff; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all;">
                    ${data.barcode}
                  </div>` : ''}
                </div>

                <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin: 20px 0;">
                  <p style="color: #92400e; margin: 0; font-size: 14px;">
                    ⏱️ <strong>Importante:</strong> O boleto pode levar de 1 a 3 dias úteis para ser compensado após o pagamento.
                  </p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.boletoUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    📄 Baixar Boleto
                  </a>
                </div>

                <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                  Enquanto aguarda a compensação, você já pode usar todas as funcionalidades do seu plano!
                </p>
              </div>
              <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  © ${new Date().getFullYear()} Tutor Flow. Todos os direitos reservados.
                </p>
              </div>
            </div>
          </body>
          </html>
        `
      };

    case 'boleto_reminder':
      return {
        subject: `⚠️ Lembrete: Seu boleto vence amanhã - Tutor Flow`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">⚠️ Lembrete de Vencimento</h1>
              </div>
              <div style="padding: 30px;">
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  Olá <strong>${data.userName}</strong>,
                </p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  Seu boleto para o plano <strong>${data.planName}</strong> vence <strong>amanhã (${data.dueDate})</strong>.
                </p>
                
                <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <h3 style="color: #92400e; margin: 0 0 15px 0;">Detalhes</h3>
                  <p style="margin: 5px 0; color: #374151;"><strong>Valor:</strong> ${data.amount}</p>
                  <p style="margin: 5px 0; color: #374151;"><strong>Vencimento:</strong> ${data.dueDate}</p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.boletoUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    📄 Baixar Boleto
                  </a>
                </div>

                <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                  Se você já realizou o pagamento, por favor desconsidere este email.
                </p>
              </div>
              <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  © ${new Date().getFullYear()} Tutor Flow. Todos os direitos reservados.
                </p>
              </div>
            </div>
          </body>
          </html>
        `
      };

    case 'boleto_paid':
      return {
        subject: `✅ Pagamento confirmado - Tutor Flow`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">✅ Pagamento Confirmado!</h1>
              </div>
              <div style="padding: 30px;">
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  Olá <strong>${data.userName}</strong>,
                </p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  Seu pagamento via boleto foi compensado com sucesso! Sua assinatura do plano <strong>${data.planName}</strong> está ativa.
                </p>
                
                <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                  <p style="color: #166534; margin: 0; font-size: 18px; font-weight: 600;">
                    🎉 Obrigado por assinar o Tutor Flow!
                  </p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${siteUrl}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Acessar Dashboard
                  </a>
                </div>
              </div>
              <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  © ${new Date().getFullYear()} Tutor Flow. Todos os direitos reservados.
                </p>
              </div>
            </div>
          </body>
          </html>
        `
      };

    case 'boleto_expired':
      return {
        subject: `❌ Boleto vencido - Tutor Flow`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">❌ Boleto Vencido</h1>
              </div>
              <div style="padding: 30px;">
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  Olá <strong>${data.userName}</strong>,
                </p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  Infelizmente seu boleto para o plano <strong>${data.planName}</strong> venceu sem pagamento.
                </p>
                
                <div style="background-color: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <p style="color: #991b1b; margin: 0; font-size: 14px;">
                    Sua assinatura foi movida para o plano gratuito. Para continuar usando as funcionalidades premium, você pode realizar uma nova assinatura.
                  </p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${siteUrl}/planos" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Ver Planos
                  </a>
                </div>
              </div>
              <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  © ${new Date().getFullYear()} Tutor Flow. Todos os direitos reservados.
                </p>
              </div>
            </div>
          </body>
          </html>
        `
      };

    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const awsRegion = Deno.env.get("AWS_SES_REGION") || "us-east-1";
    const fromEmail = Deno.env.get("AWS_SES_FROM_EMAIL");
    const fromName = Deno.env.get("AWS_SES_FROM_NAME") || "Tutor Flow";

    if (!supabaseUrl || !supabaseServiceKey || !awsAccessKeyId || !awsSecretAccessKey || !fromEmail) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const body: BoletoNotificationRequest = await req.json();
    log("Request received", { type: body.notification_type, userId: body.user_id });

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", body.user_id)
      .single();

    if (profileError || !profile) {
      throw new Error(`User not found: ${body.user_id}`);
    }

    log("User found", { email: profile.email });

    // Prepare email data
    const emailData = {
      userName: profile.name,
      planName: body.plan_name || "Premium",
      amount: body.amount ? formatCurrency(body.amount) : "R$ 0,00",
      dueDate: body.due_date ? formatDate(body.due_date) : "N/A",
      boletoUrl: body.boleto_url || "",
      barcode: body.barcode || ""
    };

    const { subject, html } = getEmailTemplate(body.notification_type, emailData);

    // Send email via AWS SES
    const sesClient = new SESClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });

    const sendEmailCommand = new SendEmailCommand({
      Source: `${fromName} <${fromEmail}>`,
      Destination: {
        ToAddresses: [profile.email],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: html,
            Charset: "UTF-8",
          },
        },
      },
    });

    await sesClient.send(sendEmailCommand);
    log("Email sent successfully", { type: body.notification_type, to: profile.email });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    log("Error", { error: (error as Error).message });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

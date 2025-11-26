import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { sendEmail } from "../_shared/ses-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  name: string;
  teacher_name: string;
  invitation_link: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: InvitationRequest = await req.json();
    console.log('[send-student-invitation] Received request:', {
      email: body.email,
      name: body.name,
      teacher_name: body.teacher_name,
      has_link: !!body.invitation_link
    });

    if (!body.email || !body.name || !body.teacher_name || !body.invitation_link) {
      console.error('[send-student-invitation] Missing required fields');
      return new Response(
        JSON.stringify({ success: false, error: "Campos obrigatórios ausentes" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Build professional HTML email
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Convite Tutor Flow</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">
              Tutor Flow
            </h1>
            <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
              Sistema de Gestão para Professores
            </p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
              Você foi convidado! 🎉
            </h2>
            
            <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              Olá <strong>${body.name}</strong>!
            </p>
            
            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              O professor(a) <strong>${body.teacher_name}</strong> convidou você para usar o <strong>Tutor Flow</strong>, 
              uma plataforma completa para gerenciar suas aulas, materiais e muito mais.
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 32px 0;">
              <a href="${body.invitation_link}" 
                 style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
                Ativar Minha Conta
              </a>
            </div>

            <!-- Alternative Link -->
            <div style="margin: 24px 0; padding: 16px; background-color: #f9fafb; border-radius: 6px; border-left: 4px solid #3b82f6;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">
                Caso o botão não funcione, copie e cole este link no navegador:
              </p>
              <p style="margin: 0; color: #3b82f6; font-size: 12px; word-break: break-all; font-family: 'Courier New', monospace;">
                ${body.invitation_link}
              </p>
            </div>

            <!-- Warning -->
            <div style="margin: 24px 0; padding: 12px; background-color: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
                ⚠️ <strong>Importante:</strong> Este link de ativação expira em 24 horas por motivos de segurança.
              </p>
            </div>

            <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
              Após ativar sua conta, você poderá acessar todos os recursos da plataforma.
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 24px 30px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px; line-height: 1.5;">
              Este é um e-mail automático do sistema <strong>Tutor Flow</strong>. Se você não esperava receber este convite, 
              pode ignorar esta mensagem.
            </p>
            <p style="margin: 0; color: #9ca3af; font-size: 11px;">
              © ${new Date().getFullYear()} Tutor Flow. Todos os direitos reservados.
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    // Send email via AWS SES
    const result = await sendEmail({
      to: body.email,
      subject: `Convite para o Tutor Flow - ${body.teacher_name}`,
      html: htmlContent,
      text: `Olá ${body.name}! O professor(a) ${body.teacher_name} convidou você para usar o Tutor Flow. Ative sua conta clicando neste link: ${body.invitation_link} (expira em 24 horas)`,
    });

    if (!result.success) {
      console.error('[send-student-invitation] Failed to send email:', result.error);
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log('[send-student-invitation] Email sent successfully:', {
      email: body.email,
      messageId: result.messageId
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.messageId,
        message: "Email de convite enviado com sucesso"
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error('[send-student-invitation] Exception:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Erro ao enviar convite" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

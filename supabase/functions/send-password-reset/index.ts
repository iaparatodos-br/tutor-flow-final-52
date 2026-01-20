import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { sendEmail } from "../_shared/ses-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE_URL = Deno.env.get('SITE_URL') || 'https://www.tutor-flow.app';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    console.log('[SEND-PASSWORD-RESET] Processing request for email:', email);

    // Validate email
    if (!email || typeof email !== 'string') {
      console.log('[SEND-PASSWORD-RESET] Missing or invalid email');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Email é obrigatório',
          code: 'missing_email'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if user exists (but don't reveal this to prevent enumeration attacks)
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      console.error('[SEND-PASSWORD-RESET] Error listing users:', userError);
      // Return success anyway to prevent enumeration
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Se o email existir, um link de recuperação foi enviado'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = userData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    // SECURITY: Don't reveal if email exists - return success even if user not found
    if (!user) {
      console.log('[SEND-PASSWORD-RESET] User not found, returning success for security');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Se o email existir, um link de recuperação foi enviado'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[SEND-PASSWORD-RESET] User found, generating recovery link');

    // Generate recovery link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${SITE_URL}/reset-password`
      }
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[SEND-PASSWORD-RESET] Error generating link:', linkError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Erro ao gerar link de recuperação',
          code: 'failed_to_generate'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recoveryLink = linkData.properties.action_link;
    const userName = user.user_metadata?.name || email.split('@')[0];

    console.log('[SEND-PASSWORD-RESET] Link generated, preparing email');

    // Create professional HTML email template
    const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Senha - Tutor Flow</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px 40px; text-align: center; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Tutor Flow</h1>
              <p style="margin: 8px 0 0 0; color: #bfdbfe; font-size: 14px;">Sistema de Gestão para Professores</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 24px; font-weight: 600;">
                Recuperação de Senha 🔐
              </h2>
              
              <p style="margin: 0 0 16px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                Olá <strong style="color: #1e293b;">${userName}</strong>!
              </p>
              
              <p style="margin: 0 0 16px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                Você solicitou a redefinição da sua senha no Tutor Flow.
              </p>
              
              <p style="margin: 0 0 30px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                Clique no botão abaixo para criar uma nova senha:
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${recoveryLink}" 
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);">
                      Redefinir Minha Senha
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Link fallback -->
              <p style="margin: 30px 0 0 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                <a href="${recoveryLink}" style="color: #3b82f6; word-break: break-all;">${recoveryLink}</a>
              </p>
            </td>
          </tr>
          
          <!-- Warning -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                      ⚠️ <strong>Importante:</strong> Este link expira em <strong>1 hora</strong>.<br>
                      Se você não solicitou esta redefinição, ignore este email. Sua senha permanecerá inalterada.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; background-color: #f8fafc; border-radius: 0 0 12px 12px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px 0; color: #64748b; font-size: 12px;">
                Este email foi enviado automaticamente pelo Tutor Flow.
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                © ${new Date().getFullYear()} Tutor Flow. Todos os direitos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const textContent = `
Recuperação de Senha - Tutor Flow

Olá ${userName}!

Você solicitou a redefinição da sua senha no Tutor Flow.

Para criar uma nova senha, acesse o link abaixo:
${recoveryLink}

IMPORTANTE: Este link expira em 1 hora.
Se você não solicitou esta redefinição, ignore este email. Sua senha permanecerá inalterada.

---
Este email foi enviado automaticamente pelo Tutor Flow.
© ${new Date().getFullYear()} Tutor Flow. Todos os direitos reservados.
    `;

    // Send email via AWS SES
    const emailResult = await sendEmail({
      to: email,
      subject: 'Recuperação de Senha - Tutor Flow',
      html: htmlContent,
      text: textContent
    });

    if (!emailResult.success) {
      console.error('[SEND-PASSWORD-RESET] Failed to send email:', emailResult.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Erro ao enviar email de recuperação',
          code: 'failed_to_send'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[SEND-PASSWORD-RESET] Email sent successfully, messageId:', emailResult.messageId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email de recuperação enviado com sucesso'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SEND-PASSWORD-RESET] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Erro interno do servidor',
        code: 'internal_error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

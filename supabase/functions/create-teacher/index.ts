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
    const { email, password, name, termsMetadata } = await req.json();

    // Validate required fields
    if (!email || !password || !name) {
      console.error('[CREATE-TEACHER] Missing required fields');
      return new Response(
        JSON.stringify({ success: false, error: 'Email, senha e nome são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[CREATE-TEACHER] Creating user:', { email, name });

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Create user WITHOUT sending native email
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // CRITICAL: Don't auto-confirm, we'll send our own email
      user_metadata: {
        name,
        role: 'professor',
        ...(termsMetadata || {})
      }
    });

    if (createError) {
      console.error('[CREATE-TEACHER] Create user error:', createError);
      
      // Check for duplicate email
      if (createError.message.includes('already registered') || 
          createError.message.includes('already been registered') ||
          createError.message.includes('User already registered')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Este email já está cadastrado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw createError;
    }

    console.log('[CREATE-TEACHER] User created:', userData.user?.id);

    // Generate confirmation link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      options: { redirectTo: `${SITE_URL}/auth/callback` }
    });

    if (linkError) {
      console.error('[CREATE-TEACHER] Generate link error:', linkError);
      throw linkError;
    }

    const confirmationLink = linkData.properties.action_link;
    console.log('[CREATE-TEACHER] Confirmation link generated');

    // Send custom email via AWS SES
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Tutor Flow</h1>
            <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Sistema de Gestão para Professores</p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Bem-vindo ao Tutor Flow! 🎉</h2>
            
            <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              Olá <strong>${name}</strong>!
            </p>
            
            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              Sua conta foi criada com sucesso. Clique no botão abaixo para confirmar seu email e começar a usar o Tutor Flow.
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 32px 0;">
              <a href="${confirmationLink}" 
                 style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Confirmar Meu Email
              </a>
            </div>

            <!-- Alternative Link -->
            <p style="margin: 24px 0 8px 0; color: #9ca3af; font-size: 13px;">
              Se o botão não funcionar, copie e cole este link no seu navegador:
            </p>
            <p style="margin: 0; word-break: break-all;">
              <a href="${confirmationLink}" style="color: #3b82f6; font-size: 12px;">${confirmationLink}</a>
            </p>

            <!-- Warning -->
            <div style="margin: 24px 0; padding: 12px; background-color: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; color: #92400e; font-size: 13px;">
                ⚠️ <strong>Importante:</strong> Este link expira em 24 horas.
              </p>
            </div>

            <!-- Ignore Notice -->
            <p style="margin: 24px 0 0 0; color: #9ca3af; font-size: 13px;">
              Se você não criou uma conta no Tutor Flow, por favor ignore este email.
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 24px 30px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px; text-align: center;">
              Este é um email automático. Por favor, não responda.
            </p>
            <p style="margin: 0; color: #9ca3af; font-size: 11px; text-align: center;">
              © ${new Date().getFullYear()} Tutor Flow. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Bem-vindo ao Tutor Flow!

Olá ${name}!

Sua conta foi criada com sucesso. Clique no link abaixo para confirmar seu email:

${confirmationLink}

⚠️ Importante: Este link expira em 24 horas.

Se você não criou uma conta no Tutor Flow, por favor ignore este email.

---
© ${new Date().getFullYear()} Tutor Flow. Todos os direitos reservados.
    `.trim();

    const emailResult = await sendEmail({
      to: email,
      subject: 'Confirme seu Email - Tutor Flow',
      html: htmlContent,
      text: textContent
    });

    if (!emailResult.success) {
      console.error('[CREATE-TEACHER] Failed to send email:', emailResult.error);
      // User was created but email failed - return partial success
      return new Response(
        JSON.stringify({ 
          success: true, 
          userId: userData.user?.id,
          emailSent: false,
          warning: 'Conta criada, mas houve erro ao enviar email de confirmação'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[CREATE-TEACHER] Email sent successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: userData.user?.id,
        emailSent: true
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[CREATE-TEACHER] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

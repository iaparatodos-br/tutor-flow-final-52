import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { sendEmail } from "../_shared/ses-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[RESEND-CONFIRMATION] Function started');

    // Parse request body
    const { email } = await req.json();

    if (!email) {
      console.error('[RESEND-CONFIRMATION] Missing email');
      return new Response(
        JSON.stringify({ success: false, error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RESEND-CONFIRMATION] Processing resend for:', email);

    // Create Supabase admin client
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

    // Check if user exists
    const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      console.error('[RESEND-CONFIRMATION] Error listing users:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = users.users.find(u => u.email === email);

    if (!user) {
      console.error('[RESEND-CONFIRMATION] User not found');
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email is already confirmed
    if (user.email_confirmed_at) {
      console.log('[RESEND-CONFIRMATION] Email already confirmed');
      return new Response(
        JSON.stringify({ success: false, error: 'Email already confirmed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate new email confirmation link
    const redirectUrl = Deno.env.get('SITE_URL') || 'https://www.tutor-flow.app';
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: `${redirectUrl}/auth/callback`
      }
    });

    if (linkError) {
      console.error('[RESEND-CONFIRMATION] Error generating confirmation link:', linkError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to generate confirmation link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract confirmation link and user name
    const confirmationLink = linkData.properties.action_link;
    const userName = user.user_metadata?.name || email.split('@')[0];

    console.log('[RESEND-CONFIRMATION] Generated confirmation link for:', userName);

    // Create professional HTML email template
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirme seu Email - Tutor Flow</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Tutor Flow</h1>
            <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Sistema de Gestão para Professores</p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Confirme seu Email 📧</h2>
            
            <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              Olá <strong>${userName}</strong>!
            </p>
            
            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              Enviamos novamente o link para confirmar seu email no <strong>Tutor Flow</strong>.
              Clique no botão abaixo para ativar sua conta.
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 32px 0;">
              <a href="${confirmationLink}" 
                 style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Confirmar Meu Email
              </a>
            </div>

            <!-- Alternative Link -->
            <div style="margin: 24px 0; padding: 16px; background-color: #f9fafb; border-radius: 6px; border-left: 4px solid #3b82f6;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">
                Caso o botão não funcione, copie e cole este link:
              </p>
              <p style="margin: 0; color: #3b82f6; font-size: 12px; word-break: break-all; font-family: monospace;">
                ${confirmationLink}
              </p>
            </div>

            <!-- Warning -->
            <div style="margin: 24px 0; padding: 12px; background-color: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; color: #92400e; font-size: 13px;">
                ⚠️ <strong>Importante:</strong> Este link expira em 24 horas.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 24px 30px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px;">
              Se você não solicitou este email, pode ignorá-lo com segurança.
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
    const emailResult = await sendEmail({
      to: email,
      subject: 'Confirme seu Email - Tutor Flow',
      html: htmlContent,
      text: `Olá ${userName}! Confirme seu email clicando neste link: ${confirmationLink} (expira em 24 horas)`,
    });

    if (!emailResult.success) {
      console.error('[RESEND-CONFIRMATION] Failed to send email via AWS SES:', emailResult.error);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send confirmation email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RESEND-CONFIRMATION] Email sent successfully via AWS SES:', emailResult.messageId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Confirmation email sent successfully' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[RESEND-CONFIRMATION] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

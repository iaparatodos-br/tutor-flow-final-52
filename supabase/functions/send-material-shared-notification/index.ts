import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  material_id: string;
  student_ids: string[];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    const { material_id, student_ids }: NotificationRequest = await req.json();

    console.log('📚 Processando notificação de material compartilhado:', {
      material_id,
      student_count: student_ids.length
    });

    // Buscar informações do material e professor
    const { data: material, error: materialError } = await supabase
      .from('materials')
      .select(`
        id,
        title,
        description,
        file_type,
        teacher_id,
        profiles!materials_teacher_id_fkey (
          id,
          name,
          email
        )
      `)
      .eq('id', material_id)
      .single();

    if (materialError || !material) {
      throw new Error(`Material não encontrado: ${materialError?.message}`);
    }

    const teacher = material.profiles;

    // Buscar informações dos alunos com suas preferências de notificação
    const { data: students, error: studentsError } = await supabase
      .from('profiles')
      .select('id, name, email, notification_preferences')
      .in('id', student_ids);

    if (studentsError) {
      throw studentsError;
    }

    console.log(`📧 Enviando emails para ${students?.length || 0} alunos`);

    const results = [];

    // Enviar email para cada aluno
    for (const student of students || []) {
      try {
        // Verificar se o aluno deseja receber notificações de material compartilhado
        const preferences = student.notification_preferences || {};
        if (preferences.material_shared === false) {
          console.log(`⏭️ Aluno ${student.email} optou por não receber notificações de material compartilhado`);
          results.push({
            student_id: student.id,
            email: student.email,
            status: 'skipped',
            reason: 'User preference disabled'
          });
          continue;
        }

        const emailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .material-card { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4f46e5; }
                .button { display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
                .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>📚 Novo Material Compartilhado!</h1>
                </div>
                <div class="content">
                  <p>Olá, <strong>${student.name}</strong>!</p>
                  
                  <p>Seu professor <strong>${teacher.name}</strong> compartilhou um novo material com você:</p>
                  
                  <div class="material-card">
                    <h2 style="margin-top: 0; color: #4f46e5;">📄 ${material.title}</h2>
                    ${material.description ? `<p style="color: #6b7280;">${material.description}</p>` : ''}
                    <p><strong>Tipo:</strong> ${material.file_type}</p>
                  </div>
                  
                  <p>Acesse a plataforma TutorFlow para visualizar e baixar o material:</p>
                  
                  <a href="${Deno.env.get('SITE_URL')}/materiais" class="button">
                    Acessar Materiais
                  </a>
                  
                  <div class="footer">
                    <p>Esta é uma notificação automática do TutorFlow</p>
                    <p>Por favor, não responda este email</p>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `;

        const { data: emailData, error: emailError } = await resend.emails.send({
          from: 'TutorFlow <onboarding@resend.dev>',
          to: [student.email],
          subject: `📚 Novo material disponível: ${material.title}`,
          html: emailHtml,
        });

        if (emailError) {
          console.error(`❌ Erro ao enviar email para ${student.email}:`, emailError);
          results.push({
            student_id: student.id,
            success: false,
            error: emailError.message
          });
        } else {
          console.log(`✅ Email enviado com sucesso para ${student.email}`);
          results.push({
            student_id: student.id,
            success: true,
            email_id: emailData.id
          });
        }
      } catch (error) {
        console.error(`❌ Erro ao processar aluno ${student.id}:`, error);
        results.push({
          student_id: student.id,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Processo concluído: ${successCount}/${results.length} emails enviados`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: results.length,
          sent: successCount,
          failed: results.length - successCount
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Erro ao enviar notificações:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { sendEmail } from "../_shared/ses-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  material_id: string;
  student_ids: string[];
  dependent_ids?: string[]; // NEW: Support for dependents
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { material_id, student_ids, dependent_ids = [] }: NotificationRequest = await req.json();

    console.log('📚 Processando notificação de material compartilhado:', {
      material_id,
      student_count: student_ids.length,
      dependent_count: dependent_ids.length
    });

    // Buscar informações do material
    const { data: material, error: materialError } = await supabase
      .from('materials')
      .select('id, title, description, file_type, teacher_id')
      .eq('id', material_id)
      .single();

    if (materialError || !material) {
      throw new Error(`Material não encontrado: ${materialError?.message}`);
    }

    // Buscar informações do professor separadamente
    const { data: teacher, error: teacherError } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', material.teacher_id)
      .single();

    if (teacherError || !teacher) {
      throw new Error(`Professor não encontrado: ${teacherError?.message}`);
    }

    // Buscar informações dos alunos com suas preferências de notificação
    const { data: students, error: studentsError } = await supabase
      .from('profiles')
      .select('id, name, email, notification_preferences')
      .in('id', student_ids);

    if (studentsError) {
      throw studentsError;
    }

    // NEW: Buscar informações dos dependentes e seus responsáveis
    let dependentsWithResponsibles: Array<{
      dependent_id: string;
      dependent_name: string;
      responsible_id: string;
      responsible_name: string;
      responsible_email: string;
      notification_preferences: any;
    }> = [];

    if (dependent_ids.length > 0) {
      const { data: dependents } = await supabase
        .from('dependents')
        .select('id, name, responsible_id')
        .in('id', dependent_ids);

      if (dependents && dependents.length > 0) {
        // Buscar perfis dos responsáveis
        const responsibleIds = [...new Set(dependents.map(d => d.responsible_id))];
        const { data: responsibles } = await supabase
          .from('profiles')
          .select('id, name, email, notification_preferences')
          .in('id', responsibleIds);

        if (responsibles) {
          for (const dep of dependents) {
            const responsible = responsibles.find(r => r.id === dep.responsible_id);
            if (responsible) {
              dependentsWithResponsibles.push({
                dependent_id: dep.id,
                dependent_name: dep.name,
                responsible_id: responsible.id,
                responsible_name: responsible.name,
                responsible_email: responsible.email,
                notification_preferences: responsible.notification_preferences || {}
              });
            }
          }
        }
      }
    }

    console.log(`📧 Enviando emails para ${students?.length || 0} alunos e ${dependentsWithResponsibles.length} dependentes`);

    const results = [];

    // Enviar email para cada aluno (normal)
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

        const emailHtml = buildEmailHtml(student.name, teacher.name, material, null);

        const emailResult = await sendEmail({
          to: student.email,
          subject: `📚 Novo material disponível: ${material.title}`,
          html: emailHtml,
        });

        if (!emailResult.success) {
          console.error(`❌ Erro ao enviar email para ${student.email}:`, emailResult.error);
          results.push({
            student_id: student.id,
            success: false,
            error: emailResult.error
          });
        } else {
          console.log(`✅ Email enviado com sucesso para ${student.email}`);
          results.push({
            student_id: student.id,
            success: true,
            email_id: emailResult.messageId
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

    // NEW: Enviar email para responsáveis de dependentes
    // Agrupar por responsável para evitar múltiplos emails
    const responsibleEmailsSent = new Set<string>();

    for (const depInfo of dependentsWithResponsibles) {
      try {
        // Verificar preferências do responsável
        if (depInfo.notification_preferences.material_shared === false) {
          console.log(`⏭️ Responsável ${depInfo.responsible_email} optou por não receber notificações de material compartilhado`);
          results.push({
            dependent_id: depInfo.dependent_id,
            responsible_id: depInfo.responsible_id,
            email: depInfo.responsible_email,
            status: 'skipped',
            reason: 'User preference disabled'
          });
          continue;
        }

        // Construir email personalizado para dependente
        const emailHtml = buildEmailHtml(depInfo.responsible_name, teacher.name, material, depInfo.dependent_name);

        const emailResult = await sendEmail({
          to: depInfo.responsible_email,
          subject: `📚 Novo material para ${depInfo.dependent_name}: ${material.title}`,
          html: emailHtml,
        });

        if (!emailResult.success) {
          console.error(`❌ Erro ao enviar email para ${depInfo.responsible_email}:`, emailResult.error);
          results.push({
            dependent_id: depInfo.dependent_id,
            responsible_id: depInfo.responsible_id,
            success: false,
            error: emailResult.error
          });
        } else {
          console.log(`✅ Email enviado para ${depInfo.responsible_email} (dependente: ${depInfo.dependent_name})`);
          responsibleEmailsSent.add(depInfo.responsible_email);
          results.push({
            dependent_id: depInfo.dependent_id,
            responsible_id: depInfo.responsible_id,
            success: true,
            email_id: emailResult.messageId
          });
        }
      } catch (error) {
        console.error(`❌ Erro ao processar dependente ${depInfo.dependent_id}:`, error);
        results.push({
          dependent_id: depInfo.dependent_id,
          responsible_id: depInfo.responsible_id,
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
          failed: results.length - successCount,
          students: students?.length || 0,
          dependents: dependentsWithResponsibles.length
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

// Helper function to build email HTML
function buildEmailHtml(
  recipientName: string, 
  teacherName: string, 
  material: { title: string; description?: string; file_type: string },
  dependentName: string | null
): string {
  return `
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
          .dependent-badge { background: #ede9fe; color: #7c3aed; padding: 8px 16px; border-radius: 8px; display: inline-block; margin-bottom: 15px; }
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
            <p>Olá, <strong>${recipientName}</strong>!</p>
            
            ${dependentName ? `
              <div class="dependent-badge">
                📌 Material compartilhado para <strong>${dependentName}</strong>
              </div>
            ` : ''}
            
            <p>Seu professor <strong>${teacherName}</strong> compartilhou um novo material${dependentName ? ` com ${dependentName}` : ' com você'}:</p>
            
            <div class="material-card">
              <h2 style="margin-top: 0; color: #4f46e5;">📄 ${material.title}</h2>
              ${material.description ? `<p style="color: #6b7280;">${material.description}</p>` : ''}
              <p><strong>Tipo:</strong> ${material.file_type}</p>
              ${dependentName ? `<p><strong>Aluno:</strong> ${dependentName} <span style="color: #7c3aed;">(dependente)</span></p>` : ''}
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
}

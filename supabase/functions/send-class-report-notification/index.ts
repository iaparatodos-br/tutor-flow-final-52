import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/ses-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { classId, reportId } = await req.json();
    
    console.log(`Processing notification for class ${classId} and report ${reportId}`);

    // Get class information with participants (including dependent_id)
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select(`
        id,
        class_date,
        duration_minutes,
        is_group_class,
        teacher_id
      `)
      .eq('id', classId)
      .maybeSingle();

    if (classError) {
      console.error('Error fetching class data:', classError);
      throw classError;
    }

    // Get teacher information separately
    const { data: teacher, error: teacherError } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', classData.teacher_id)
      .maybeSingle();

    if (teacherError || !teacher) {
      console.error('Error fetching teacher:', teacherError);
      throw new Error('Teacher not found');
    }

    console.log(`Found teacher: ${teacher.name}`);

    // Get participants with dependent_id
    const { data: participants, error: participantsError } = await supabase
      .from('class_participants')
      .select('student_id, dependent_id')
      .eq('class_id', classId);

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      throw participantsError;
    }

    // Get report data
    const { data: reportData, error: reportError } = await supabase
      .from('class_reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle();

    if (reportError) {
      console.error('Error fetching report data:', reportError);
      throw reportError;
    }

    // Get individual feedbacks for this report (including dependent_id)
    const { data: feedbacks, error: feedbackError } = await supabase
      .from('class_report_feedbacks')
      .select('student_id, dependent_id, feedback')
      .eq('report_id', reportId);

    if (feedbackError) {
      console.error('Error fetching feedbacks:', feedbackError);
    }

    if (!participants || participants.length === 0) {
      throw new Error('No students found in class participants');
    }

    console.log(`Notifying ${participants.length} participants`);

    let notifiedCount = 0;

    // Send email to each participant
    for (const participant of participants) {
      try {
        // Get student profile
        const { data: student } = await supabase
          .from('profiles')
          .select('id, name, email, notification_preferences')
          .eq('id', participant.student_id)
          .maybeSingle();

        if (!student) {
          console.error(`Student not found: ${participant.student_id}`);
          continue;
        }

        // Verificar se aluno/responsável quer receber relatórios
        const preferences = student.notification_preferences as any;
        if (preferences?.class_report_created === false) {
          console.log(`⏭️ Aluno/Responsável ${student.id} desabilitou notificações de relatórios`);
          continue;
        }

        // NEW: Buscar dados do dependente se aplicável
        let dependentName: string | null = null;
        if (participant.dependent_id) {
          const { data: dependent } = await supabase
            .from('dependents')
            .select('name')
            .eq('id', participant.dependent_id)
            .maybeSingle();
          
          if (dependent) {
            dependentName = dependent.name;
            console.log(`📌 Relatório para dependente: ${dependentName}`);
          }
        }

        // Get guardian email from relationship
        const { data: relationship } = await supabase
          .from('teacher_student_relationships')
          .select('student_guardian_email, student_guardian_name')
          .eq('teacher_id', classData.teacher_id)
          .eq('student_id', participant.student_id)
          .maybeSingle();

        const recipientEmail = relationship?.student_guardian_email || student.email;
        const recipientName = relationship?.student_guardian_name || student.name;

        // Find individual feedback for this student/dependent
        const studentFeedback = feedbacks?.find(f => 
          f.student_id === participant.student_id && 
          (participant.dependent_id ? f.dependent_id === participant.dependent_id : !f.dependent_id)
        );
        
        // Format class date
        const classDate = new Date(classData.class_date);
        const formattedDate = classDate.toLocaleDateString('pt-BR');
        const formattedTime = classDate.toLocaleTimeString('pt-BR', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        // Prepare email content
        const emailSubject = dependentName 
          ? `Novo relato de aula de ${dependentName} - ${teacher.name}`
          : `Novo relato de aula - ${teacher.name}`;

        const emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Novo Relato de Aula</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Professor ${teacher.name}</p>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <p>Olá <strong>${recipientName}</strong>,</p>
              
              ${dependentName ? `
                <div style="background: #ede9fe; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; display: inline-block;">
                  <span style="color: #7c3aed; font-weight: 500;">📌 Relatório da aula de ${dependentName}</span>
                </div>
              ` : ''}
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                <h3 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">📚 Informações da Aula</h3>
                <p style="margin: 5px 0; color: #666;"><strong>Aluno:</strong> ${dependentName || student.name}${dependentName ? ' (dependente)' : ''}</p>
                <p style="margin: 5px 0; color: #666;"><strong>Data:</strong> ${formattedDate}</p>
                <p style="margin: 5px 0; color: #666;"><strong>Horário:</strong> ${formattedTime}</p>
                <p style="margin: 5px 0; color: #666;"><strong>Duração:</strong> ${classData.duration_minutes} minutos</p>
              </div>

              <div style="margin-bottom: 25px;">
                <h3 style="color: #333; margin-bottom: 10px;">📖 Resumo da Aula</h3>
                <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid #667eea; border-radius: 4px;">
                  <p style="margin: 0; line-height: 1.6; white-space: pre-wrap;">${reportData.lesson_summary}</p>
                </div>
              </div>

              ${reportData.homework ? `
                <div style="margin-bottom: 25px;">
                  <h3 style="color: #333; margin-bottom: 10px;">✏️ Tarefas${dependentName ? ` para ${dependentName}` : ''}</h3>
                  <div style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; border-radius: 4px;">
                    <p style="margin: 0; line-height: 1.6; white-space: pre-wrap;">${reportData.homework}</p>
                  </div>
                </div>
              ` : ''}

              ${reportData.extra_materials ? `
                <div style="margin-bottom: 25px;">
                  <h3 style="color: #333; margin-bottom: 10px;">🔗 Materiais Extras</h3>
                  <div style="background: #d1ecf1; padding: 15px; border-left: 4px solid #17a2b8; border-radius: 4px;">
                    <p style="margin: 0; line-height: 1.6; white-space: pre-wrap;">${reportData.extra_materials}</p>
                  </div>
                </div>
              ` : ''}

              ${studentFeedback ? `
                <div style="margin-bottom: 25px;">
                  <h3 style="color: #333; margin-bottom: 10px;">💬 Feedback Individual${dependentName ? ` para ${dependentName}` : ''}</h3>
                  <div style="background: #d4edda; padding: 15px; border-left: 4px solid #28a745; border-radius: 4px;">
                    <p style="margin: 0; line-height: 1.6; white-space: pre-wrap;">${studentFeedback.feedback}</p>
                  </div>
                </div>
              ` : ''}

              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              
              <div style="text-align: center; color: #666; font-size: 14px;">
                <p>Este é um email automático do sistema de gerenciamento de aulas.</p>
                <p style="margin: 10px 0 0 0;">
                  <strong>Professor ${teacher.name}</strong><br>
                  ${teacher.email}
                </p>
              </div>
            </div>
          </div>
        `;

        // Send email
        if (recipientEmail) {
          const emailResult = await sendEmail({
            to: recipientEmail,
            subject: emailSubject,
            html: emailContent,
          });

          if (emailResult.success) {
            console.log(`✅ Email sent to: ${recipientEmail}${dependentName ? ` (for ${dependentName})` : ''}`);
            notifiedCount++;
          } else {
            console.error(`Failed to send email to: ${recipientEmail}`, emailResult.error);
          }
        }

        // Record notification in database
        await supabase
          .from('class_notifications')
          .insert({
            class_id: classId,
            student_id: participant.student_id,
            notification_type: 'class_report_created',
            status: 'sent'
          });

      } catch (error) {
        console.error(`Error sending email to participant ${participant.student_id}:`, error);
        // Continue with next participant even if one fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Class report notifications sent successfully",
        notified_students: notifiedCount
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("Error in send-class-report-notification:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

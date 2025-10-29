import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { classId, reportId } = await req.json();
    
    console.log(`Processing notification for class ${classId} and report ${reportId}`);

    // Get class information with participants
    const { data: classData, error: classError } = await supabaseAdmin
      .from('classes')
      .select(`
        id,
        class_date,
        duration_minutes,
        is_group_class,
        profiles!classes_teacher_id_fkey (
          id,
          name,
          email
        ),
        class_participants (
          student_id,
          profiles!class_participants_student_id_fkey (
            id,
            name,
            email,
            guardian_name,
            guardian_email
          )
        )
      `)
      .eq('id', classId)
      .single();

    if (classError) {
      console.error('Error fetching class data:', classError);
      throw classError;
    }

    // Get report data
    const { data: reportData, error: reportError } = await supabaseAdmin
      .from('class_reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (reportError) {
      console.error('Error fetching report data:', reportError);
      throw reportError;
    }

    // Get teacher information
    const teacherProfile = classData.profiles;
    if (!teacherProfile) {
      throw new Error('Teacher information not found');
    }

    const teacher = Array.isArray(teacherProfile) ? teacherProfile[0] : teacherProfile;
    
    console.log(`Found teacher: ${teacher?.name}`);

    // Get individual feedbacks for this report
    const { data: feedbacks, error: feedbackError } = await supabaseAdmin
      .from('class_report_feedbacks')
      .select(`
        student_id,
        feedback,
        profiles!class_report_feedbacks_student_id_fkey (
          name,
          email,
          guardian_name,
          guardian_email
        )
      `)
      .eq('report_id', reportId);

    if (feedbackError) {
      console.error('Error fetching feedbacks:', feedbackError);
    }

    // Prepare list of students to notify (for both individual and group classes)
    const studentsToNotify = classData.class_participants
      .map(p => p.profiles)
      .filter(profile => profile !== null);

    if (studentsToNotify.length === 0) {
      throw new Error('No students found in class participants');
    }

    console.log(`Notifying ${studentsToNotify.length} students`);

    // Send email to each student and their guardian
    for (const student of studentsToNotify) {
      try {
        // Find individual feedback for this student
        const studentFeedback = feedbacks?.find(f => f.student_id === student.id);
        
        // Format class date
        const classDate = new Date(classData.class_date);
        const formattedDate = classDate.toLocaleDateString('pt-BR');
        const formattedTime = classDate.toLocaleTimeString('pt-BR', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        // Prepare email content
        const emailSubject = `Novo relato de aula - ${teacher?.name}`;
        const emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Novo Relato de Aula</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Professor ${teacher?.name}</p>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                <h3 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">📚 Informações da Aula</h3>
                <p style="margin: 5px 0; color: #666;"><strong>Aluno:</strong> ${student.name}</p>
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
                  <h3 style="color: #333; margin-bottom: 10px;">✏️ Tarefas</h3>
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
                  <h3 style="color: #333; margin-bottom: 10px;">💬 Feedback Individual</h3>
                  <div style="background: #d4edda; padding: 15px; border-left: 4px solid #28a745; border-radius: 4px;">
                    <p style="margin: 0; line-height: 1.6; white-space: pre-wrap;">${studentFeedback.feedback}</p>
                  </div>
                </div>
              ` : ''}

              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              
              <div style="text-align: center; color: #666; font-size: 14px;">
                <p>Este é um email automático do sistema de gerenciamento de aulas.</p>
                <p style="margin: 10px 0 0 0;">
                  <strong>Professor ${teacher?.name}</strong><br>
                  ${teacher?.email}
                </p>
              </div>
            </div>
          </div>
        `;

        // Send to student
        if (student.email) {
          await resend.emails.send({
            from: `${teacher?.name} <noreply@resend.dev>`,
            to: [student.email],
            subject: emailSubject,
            html: emailContent
          });

          console.log(`Email sent to student: ${student.email}`);
        }

        // Send to guardian if exists and is different from student email
        if (student.guardian_email && student.guardian_email !== student.email) {
          const guardianEmailContent = emailContent.replace(
            `<p style="margin: 5px 0; color: #666;"><strong>Aluno:</strong> ${student.name}</p>`,
            `<p style="margin: 5px 0; color: #666;"><strong>Aluno:</strong> ${student.name}</p>
             <p style="margin: 5px 0; color: #666;"><strong>Responsável:</strong> ${student.guardian_name || 'Responsável'}</p>`
          );

          await resend.emails.send({
            from: `${teacher?.name} <noreply@resend.dev>`,
            to: [student.guardian_email],
            subject: emailSubject,
            html: guardianEmailContent
          });

          console.log(`Email sent to guardian: ${student.guardian_email}`);
        }

        // Record notification in database
        await supabaseAdmin
          .from('class_notifications')
          .insert({
            class_id: classId,
            student_id: student.id,
            notification_type: 'class_report_created',
            status: 'sent'
          });

      } catch (error) {
        console.error(`Error sending email to student ${student.name}:`, error);
        // Continue with next student even if one fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Class report notifications sent successfully",
        notified_students: studentsToNotify.length
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
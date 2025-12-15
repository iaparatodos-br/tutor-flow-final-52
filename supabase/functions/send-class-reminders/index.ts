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

    console.log("🔔 Iniciando envio de lembretes automáticos...");

    // 1. Buscar aulas confirmadas nas próximas 24 horas
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: classes, error: classesError } = await supabase
      .from("classes")
      .select(`
        id,
        class_date,
        duration_minutes,
        teacher_id,
        service_id,
        class_services (
          name
        )
      `)
      .eq("status", "confirmada")
      .gte("class_date", now.toISOString())
      .lte("class_date", tomorrow.toISOString())
      .eq("is_template", false);

    if (classesError) {
      console.error("Erro ao buscar aulas:", classesError);
      throw classesError;
    }

    console.log(`📚 Encontradas ${classes?.length || 0} aulas nas próximas 24h`);

    if (!classes || classes.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Nenhuma aula encontrada nas próximas 24h",
          reminders_sent: 0 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    let remindersSent = 0;
    let errors = 0;

    // 2. Para cada aula, buscar participantes e enviar lembretes
    for (const classData of classes) {
      try {
        // Buscar professor
        const { data: teacher } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", classData.teacher_id)
          .single();

        if (!teacher) {
          console.error(`Professor não encontrado para aula ${classData.id}`);
          continue;
        }

        // Buscar participantes confirmados (incluindo dependent_id)
        const { data: participants, error: participantsError } = await supabase
          .from("class_participants")
          .select(`
            id,
            student_id,
            dependent_id,
            profiles (
              name,
              email
            )
          `)
          .eq("class_id", classData.id)
          .eq("status", "confirmada");

        if (participantsError || !participants) {
          console.error(`Erro ao buscar participantes da aula ${classData.id}:`, participantsError);
          continue;
        }

        // 3. Enviar lembrete para cada participante
        for (const participant of participants) {
          try {
            // NEW: Buscar dados do dependente se aplicável
            let dependentName: string | null = null;
            if (participant.dependent_id) {
              const { data: dependent } = await supabase
                .from("dependents")
                .select("name")
                .eq("id", participant.dependent_id)
                .single();
              
              if (dependent) {
                dependentName = dependent.name;
                console.log(`📌 Lembrete para dependente: ${dependentName}`);
              }
            }

            // Buscar preferências de notificação do aluno/responsável
            const { data: studentProfile } = await supabase
              .from("profiles")
              .select("notification_preferences")
              .eq("id", participant.student_id)
              .single();

            // Verificar se aluno/responsável quer receber lembretes
            const preferences = studentProfile?.notification_preferences as any;
            if (preferences?.class_reminder === false) {
              console.log(`⏭️ Aluno/Responsável ${participant.student_id} desabilitou lembretes de aula`);
              continue;
            }

            // Verificar se já enviou lembrete para este aluno nesta aula
            const { data: existingNotification } = await supabase
              .from("class_notifications")
              .select("id")
              .eq("class_id", classData.id)
              .eq("student_id", participant.student_id)
              .eq("notification_type", "class_reminder")
              .maybeSingle();

            if (existingNotification) {
              console.log(`⏭️ Lembrete já enviado para aluno ${participant.student_id} na aula ${classData.id}`);
              continue;
            }

            // Buscar dados do relacionamento para email do responsável
            const { data: relationship } = await supabase
              .from("teacher_student_relationships")
              .select("student_guardian_email, student_guardian_name")
              .eq("teacher_id", classData.teacher_id)
              .eq("student_id", participant.student_id)
              .single();

            const student = participant.profiles as any;
            const recipientEmail = relationship?.student_guardian_email || student.email;
            const recipientName = relationship?.student_guardian_name || student.name;

            // Formatar data e hora
            const classDateTime = new Date(classData.class_date);
            const formattedDate = classDateTime.toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              timeZone: "America/Sao_Paulo",
            });
            const formattedTime = classDateTime.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Sao_Paulo",
            });

            // Calcular tempo até a aula
            const hoursUntilClass = Math.round((classDateTime.getTime() - now.getTime()) / (1000 * 60 * 60));

            // Construir email
            const emailHtml = `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                    .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
                    .highlight { background: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0; text-align: center; }
                    .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
                    .dependent-badge { background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 9999px; font-size: 12px; display: inline-block; margin-left: 8px; }
                    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h2>⏰ Lembrete de Aula</h2>
                    </div>
                    <div class="content">
                      <p>Olá <strong>${recipientName}</strong>,</p>
                      
                      <div class="highlight">
                        <h3 style="margin: 0; color: #f59e0b;">
                          🔔 ${dependentName 
                            ? `${dependentName} tem aula em ${hoursUntilClass}h!`
                            : `Você tem aula em ${hoursUntilClass}h!`
                          }
                        </h3>
                      </div>
                      
                      <div class="info-box">
                        <h3 style="margin-top: 0;">📋 Detalhes da Aula</h3>
                        <p><strong>Serviço:</strong> ${(classData.class_services as any)?.name || 'Aula'}</p>
                        <p><strong>Data:</strong> ${formattedDate}</p>
                        <p><strong>Horário:</strong> ${formattedTime}</p>
                        <p><strong>Duração:</strong> ${classData.duration_minutes} minutos</p>
                        <p><strong>Professor:</strong> ${teacher.name}</p>
                        ${dependentName ? `<p><strong>Aluno:</strong> ${dependentName}<span class="dependent-badge">📌 Dependente</span></p>` : ''}
                      </div>
                      
                      <p style="text-align: center; margin: 30px 0;">
                        <a href="${Deno.env.get("SITE_URL")}/agenda" class="button">
                          Ver Detalhes na Agenda
                        </a>
                      </p>
                      
                      <p style="font-size: 14px; color: #6b7280;">
                        💡 <strong>Dica:</strong> ${dependentName 
                          ? `Prepare os materiais de ${dependentName} e chegue com alguns minutos de antecedência para aproveitar melhor a aula!`
                          : 'Prepare seus materiais e chegue com alguns minutos de antecedência para aproveitar melhor a aula!'
                        }
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

            // Enviar email
            const emailResult = await sendEmail({
              to: recipientEmail,
              subject: dependentName 
                ? `⏰ Lembrete: Aula de ${dependentName} com ${teacher.name} em ${hoursUntilClass}h`
                : `⏰ Lembrete: Aula com ${teacher.name} em ${hoursUntilClass}h`,
              html: emailHtml,
            });

            if (!emailResult.success) {
              console.error(`❌ Erro ao enviar email para ${recipientEmail}:`, emailResult.error);
              errors++;
              continue;
            }

            // Registrar notificação
            const { error: notificationError } = await supabase
              .from("class_notifications")
              .insert({
                class_id: classData.id,
                student_id: participant.student_id,
                notification_type: "class_reminder",
                status: "sent",
              });

            if (notificationError) {
              console.error("⚠️ Erro ao salvar notificação:", notificationError);
            }

            remindersSent++;
            console.log(`✅ Lembrete enviado para ${recipientName} (${recipientEmail})${dependentName ? ` - Dependente: ${dependentName}` : ''}`);

          } catch (participantError) {
            console.error(`Erro ao processar participante:`, participantError);
            errors++;
          }
        }
      } catch (classError) {
        console.error(`Erro ao processar aula ${classData.id}:`, classError);
        errors++;
      }
    }

    console.log(`✅ Processo concluído: ${remindersSent} lembretes enviados, ${errors} erros`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Lembretes enviados com sucesso`,
        reminders_sent: remindersSent,
        errors: errors 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("❌ Erro crítico no envio de lembretes:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        success: false 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

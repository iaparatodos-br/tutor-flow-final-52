import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);


function formatPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function groupClassesByUserAndMonth(classes: any[]): Record<string, Record<string, any[]>> {
  const grouped: Record<string, Record<string, any[]>> = {};
  
  for (const classItem of classes) {
    const userId = classItem.teacher_id;
    const classDate = new Date(classItem.class_date);
    const period = formatPeriod(classDate);
    
    if (!grouped[userId]) grouped[userId] = {};
    if (!grouped[userId][period]) grouped[userId][period] = [];
    
    grouped[userId][period].push(classItem);
  }
  
  return grouped;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ** Passo 1: Segurança **
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error("Tentativa de acesso não autorizado ao arquivador");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }), 
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401 
      }
    );
  }

  try {
    console.log("Iniciando processo de arquivamento de dados antigos...");
    
    // Data limite: 18 meses atrás
    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
    
    console.log(`Arquivando dados anteriores a: ${eighteenMonthsAgo.toISOString()}`);
    
    // Buscar aulas antigas (sem FK joins para Deno - Etapa 0.6)
    const { data: oldClasses, error: fetchError } = await supabaseAdmin
      .from('classes')
      .select('id, teacher_id, class_date, duration_minutes, status, notes, service_id, created_at, updated_at')
      .lt('class_date', eighteenMonthsAgo.toISOString())
      .order('class_date', { ascending: true });
    
    if (fetchError) {
      console.error("Erro ao buscar aulas antigas:", fetchError);
      throw fetchError;
    }

    if (!oldClasses || oldClasses.length === 0) {
      console.log("Nenhuma aula antiga encontrada para arquivar.");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Nenhuma aula antiga encontrada para arquivar.",
          archivedCount: 0
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Encontradas ${oldClasses.length} aulas para arquivar`);
    
    // Agrupar dados por usuário e período (estrutura simplificada sem FK joins)
    const archivesByUser = groupClassesByUserAndMonth(oldClasses);
    
    // Fetch participants and reports separately for all old classes
    const allClassIds = oldClasses.map(c => c.id);
    
    // Batch fetch participants
    const { data: allParticipants } = await supabaseAdmin
      .from('class_participants')
      .select('id, class_id, student_id, dependent_id, status, cancelled_at, cancelled_by, charge_applied, cancellation_reason, confirmed_at, completed_at')
      .in('class_id', allClassIds);
    
    // Batch fetch reports
    const { data: allReports } = await supabaseAdmin
      .from('class_reports')
      .select('id, class_id, lesson_summary, homework, extra_materials, created_at, updated_at')
      .in('class_id', allClassIds);

    // Create lookup maps
    const participantsByClass = new Map<string, any[]>();
    for (const p of (allParticipants || [])) {
      if (!participantsByClass.has(p.class_id)) participantsByClass.set(p.class_id, []);
      participantsByClass.get(p.class_id)!.push(p);
    }
    
    const reportsByClass = new Map<string, any[]>();
    for (const r of (allReports || [])) {
      if (!reportsByClass.has(r.class_id)) reportsByClass.set(r.class_id, []);
      reportsByClass.get(r.class_id)!.push(r);
    }
    
    let totalArchived = 0;
    let totalErrors = 0;

    // Processar cada usuário e período
    for (const [userId, monthlyArchives] of Object.entries(archivesByUser)) {
      console.log(`Processando arquivos para usuário: ${userId}`);
      
      for (const [period, classes] of Object.entries(monthlyArchives)) {
        try {
          // Build archive data with related records
          const archiveData = {
            classes: classes.map(c => ({
              ...c,
              participants: participantsByClass.get(c.id) || [],
              reports: reportsByClass.get(c.id) || [],
            })),
            metadata: {
              archivedAt: new Date().toISOString(),
              totalClasses: classes.length,
              period
            }
          };

          const filePath = `${userId}/${period}.json`;
          const jsonData = JSON.stringify(archiveData, null, 2);
          
          console.log(`Fazendo upload do arquivo: ${filePath}`);
          
          // Upload para o Storage
          const { error: uploadError } = await supabaseAdmin.storage
            .from('archives')
            .upload(filePath, jsonData, { 
              contentType: 'application/json',
              upsert: true
            });

          if (uploadError) {
            console.error(`Falha no upload do arquivo ${filePath}:`, uploadError);
            totalErrors++;
            continue;
          }
          
          console.log(`Upload bem-sucedido: ${filePath}`);
          
          // Coletar IDs para deleção
          const classIds = classes.map(c => c.id);
          const participantIds = classIds.flatMap(cid => (participantsByClass.get(cid) || []).map(p => p.id));
          const reportIds = classIds.flatMap(cid => (reportsByClass.get(cid) || []).map(r => r.id));
          
          // CRITICAL: Delete in correct FK order
          // 1. invoice_classes (references participant_id - FK RESTRICT)
          if (participantIds.length > 0) {
            await supabaseAdmin.from('invoice_classes').delete().in('participant_id', participantIds);
          }
          
          // 2. class_report_photos & class_report_feedbacks (reference report_id)
          if (reportIds.length > 0) {
            await supabaseAdmin.from('class_report_photos').delete().in('report_id', reportIds);
            await supabaseAdmin.from('class_report_feedbacks').delete().in('report_id', reportIds);
          }
          
          // 3. class_reports
          if (reportIds.length > 0) {
            const { error: deleteReportsError } = await supabaseAdmin
              .from('class_reports')
              .delete()
              .in('id', reportIds);
            if (deleteReportsError) {
              console.error(`Erro ao deletar relatórios:`, deleteReportsError);
              totalErrors++;
              continue;
            }
          }
          
          // 4. class_notifications (reference class_id)
          await supabaseAdmin.from('class_notifications').delete().in('class_id', classIds);
          
          // 5. class_participants
          if (participantIds.length > 0) {
            const { error: deleteParticipantsError } = await supabaseAdmin
              .from('class_participants')
              .delete()
              .in('id', participantIds);
            if (deleteParticipantsError) {
              console.error(`Erro ao deletar participantes:`, deleteParticipantsError);
              totalErrors++;
              continue;
            }
          }
          
          // 7. Finally delete classes
          const { error: deleteClassesError } = await supabaseAdmin
            .from('classes')
            .delete()
            .in('id', classIds);
            
          if (deleteClassesError) {
            console.error(`Erro ao deletar aulas para período ${period}:`, deleteClassesError);
            totalErrors++;
            continue;
          }
          
          console.log(`Dados do período ${period} arquivados e removidos com sucesso`);
          totalArchived += classes.length;
          
        } catch (error) {
          console.error(`Erro ao processar período ${period} para usuário ${userId}:`, error);
          totalErrors++;
        }
      }
    }
    
    console.log(`Processo de arquivamento concluído. Arquivadas: ${totalArchived} aulas. Erros: ${totalErrors}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Processo de arquivamento concluído",
        archivedCount: totalArchived,
        errorCount: totalErrors
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("Erro no processo de arquivamento:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        success: false 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
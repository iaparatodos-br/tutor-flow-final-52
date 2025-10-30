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

interface ArchiveData {
  [userId: string]: {
    [period: string]: {
      classes: any[];
      reports: any[];
      metadata: {
        archivedAt: string;
        totalClasses: number;
        totalReports: number;
        period: string;
      };
    };
  };
}

function formatPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function groupDataByUserAndMonth(classes: any[]): ArchiveData {
  const grouped: ArchiveData = {};
  
  for (const classItem of classes) {
    const userId = classItem.teacher_id;
    const classDate = new Date(classItem.class_date);
    const period = formatPeriod(classDate);
    
    if (!grouped[userId]) {
      grouped[userId] = {};
    }
    
    if (!grouped[userId][period]) {
      grouped[userId][period] = {
        classes: [],
        reports: [],
        metadata: {
          archivedAt: new Date().toISOString(),
          totalClasses: 0,
          totalReports: 0,
          period
        }
      };
    }
    
    grouped[userId][period].classes.push(classItem);
    
    // Adicionar relatórios se existirem
    if (classItem.class_reports && classItem.class_reports.length > 0) {
      grouped[userId][period].reports.push(...classItem.class_reports);
    }
  }
  
  // Atualizar metadados
  for (const userId in grouped) {
    for (const period in grouped[userId]) {
      const data = grouped[userId][period];
      data.metadata.totalClasses = data.classes.length;
      data.metadata.totalReports = data.reports.length;
    }
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
    
    // Buscar aulas antigas com seus relatórios e participantes
    const { data: oldClasses, error: fetchError } = await supabaseAdmin
      .from('classes')
      .select(`
        id,
        teacher_id,
        student_id,
        class_date,
        duration_minutes,
        status,
        notes,
        service_id,
        created_at,
        updated_at,
        class_participants (
          id,
          student_id,
          status,
          cancelled_at,
          cancelled_by,
          charge_applied,
          cancellation_reason,
          confirmed_at,
          completed_at
        ),
        class_reports (
          id,
          lesson_summary,
          homework,
          extra_materials,
          created_at,
          updated_at
        )
      `)
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
    
    // Agrupar dados por usuário e período
    const archivesByUser = groupDataByUserAndMonth(oldClasses);
    
    let totalArchived = 0;
    let totalErrors = 0;

    // Processar cada usuário e período
    for (const [userId, monthlyArchives] of Object.entries(archivesByUser)) {
      console.log(`Processando arquivos para usuário: ${userId}`);
      
      for (const [period, data] of Object.entries(monthlyArchives)) {
        try {
          const filePath = `${userId}/${period}.json`;
          const jsonData = JSON.stringify(data, null, 2);
          
          console.log(`Fazendo upload do arquivo: ${filePath}`);
          
          // Upload para o Storage
          const { error: uploadError } = await supabaseAdmin.storage
            .from('archives')
            .upload(filePath, jsonData, { 
              contentType: 'application/json',
              upsert: true // Sobrescrever se já existir
            });

          if (uploadError) {
            console.error(`Falha no upload do arquivo ${filePath}:`, uploadError);
            totalErrors++;
            continue;
          }
          
          console.log(`Upload bem-sucedido: ${filePath}`);
          
          // Coletar IDs para deleção
          const classIds = data.classes.map(c => c.id);
          const reportIds = data.reports.map(r => r.id);
          const participantIds = data.classes
            .flatMap(c => c.class_participants || [])
            .map(p => p.id);
          
          // Deletar dados do banco principal (dentro de transação, ordem importa)
          // 1. Deletar relatórios primeiro
          if (reportIds.length > 0) {
            const { error: deleteReportsError } = await supabaseAdmin
              .from('class_reports')
              .delete()
              .in('id', reportIds);
              
            if (deleteReportsError) {
              console.error(`Erro ao deletar relatórios para período ${period}:`, deleteReportsError);
              totalErrors++;
              continue;
            }
          }
          
          // 2. Deletar participantes
          if (participantIds.length > 0) {
            const { error: deleteParticipantsError } = await supabaseAdmin
              .from('class_participants')
              .delete()
              .in('id', participantIds);
              
            if (deleteParticipantsError) {
              console.error(`Erro ao deletar participantes para período ${period}:`, deleteParticipantsError);
              totalErrors++;
              continue;
            }
          }
          
          // 3. Deletar classes por último
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
          totalArchived += data.classes.length;
          
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
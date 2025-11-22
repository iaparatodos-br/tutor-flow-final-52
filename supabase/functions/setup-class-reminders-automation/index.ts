import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    console.log("⚙️ Configurando automação de lembretes de aula...");

    // 1. Habilitar extensões necessárias
    const { error: extensionsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE EXTENSION IF NOT EXISTS pg_cron;
        CREATE EXTENSION IF NOT EXISTS pg_net;
      `
    });

    if (extensionsError) {
      console.error("Erro ao habilitar extensões:", extensionsError);
      // Não é crítico se as extensões já existirem
    }

    // 2. Remover job existente (se houver)
    const { error: unscheduleError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT cron.unschedule('send-class-reminders-daily');
      `
    });

    if (unscheduleError) {
      console.log("Job anterior não encontrado ou já removido");
    }

    // 3. Criar novo job para rodar diariamente às 9h (horário de Brasília)
    const functionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-class-reminders`;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const { error: scheduleError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT cron.schedule(
          'send-class-reminders-daily',
          '0 12 * * *', -- 12h UTC = 9h BRT
          $$
          SELECT
            net.http_post(
              url:='${functionUrl}',
              headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
              body:='{"triggered_by": "cron", "time": "'||now()||'"}'::jsonb
            ) as request_id;
          $$
        );
      `
    });

    if (scheduleError) {
      console.error("Erro ao agendar job:", scheduleError);
      throw scheduleError;
    }

    console.log("✅ Automação configurada com sucesso!");
    console.log("📅 Lembretes serão enviados diariamente às 9h (horário de Brasília)");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Automação de lembretes configurada com sucesso",
        schedule: "Diário às 9h (horário de Brasília)",
        cron_expression: "0 12 * * * (UTC)"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("❌ Erro ao configurar automação:", error);
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

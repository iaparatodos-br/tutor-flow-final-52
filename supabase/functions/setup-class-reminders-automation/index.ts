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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !anonKey) {
      throw new Error("Missing required environment variables");
    }

    console.log("[SETUP-CLASS-REMINDERS] Configurando automação de lembretes de aula...");

    // 1. Remover job existente (se houver)
    const { error: unscheduleError } = await supabase.rpc('cron_unschedule', {
      p_jobname: 'send-class-reminders-daily'
    });

    if (unscheduleError) {
      console.log("[SETUP-CLASS-REMINDERS] Job anterior não encontrado ou já removido (normal na primeira execução)");
    }

    // 2. Criar novo job para rodar diariamente às 12h UTC (9h BRT)
    const functionUrl = `${supabaseUrl}/functions/v1/send-class-reminders`;

    const { data, error: scheduleError } = await supabase.rpc('cron_schedule', {
      p_jobname: 'send-class-reminders-daily',
      p_schedule: '0 12 * * *',
      p_command: `
        SELECT net.http_post(
          url:='${functionUrl}',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
          body:='{"triggered_by": "cron"}'::jsonb
        ) as request_id;
      `
    });

    if (scheduleError) {
      console.error("[SETUP-CLASS-REMINDERS] Erro ao agendar job:", scheduleError);
      throw scheduleError;
    }

    console.log("[SETUP-CLASS-REMINDERS] Automação configurada com sucesso!");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Automação de lembretes configurada com sucesso",
        schedule: "Diário às 9h (horário de Brasília)",
        cron_expression: "0 12 * * * (UTC)",
        data
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("[SETUP-CLASS-REMINDERS] Erro ao configurar automação:", error);
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

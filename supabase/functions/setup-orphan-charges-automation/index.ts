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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !anonKey) {
      throw new Error("Missing required environment variables");
    }

    console.log('[SETUP-ORPHAN-CHARGES] Setting up orphan cancellation charges automation');

    const functionUrl = `${supabaseUrl}/functions/v1/process-orphan-cancellation-charges`;
    const cronSchedule = '0 2 * * 1'; // Segunda-feira às 02:00 UTC

    // 1. Remover job existente (se houver)
    const { error: unscheduleError } = await supabaseAdmin.rpc('cron_unschedule', {
      p_jobname: 'process-orphan-cancellation-charges-weekly'
    });

    if (unscheduleError) {
      console.log('[SETUP-ORPHAN-CHARGES] Job anterior não encontrado (normal na primeira execução)');
    }

    // 2. Criar novo job
    const { data, error: scheduleError } = await supabaseAdmin.rpc('cron_schedule', {
      p_jobname: 'process-orphan-cancellation-charges-weekly',
      p_schedule: cronSchedule,
      p_command: `
        SELECT net.http_post(
          url:='${functionUrl}',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
          body:='{"triggered_by": "cron"}'::jsonb
        ) as request_id;
      `
    });

    if (scheduleError) {
      console.error('[SETUP-ORPHAN-CHARGES] Setup error:', scheduleError);
      throw scheduleError;
    }

    console.log('[SETUP-ORPHAN-CHARGES] Automation setup completed successfully');

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Automação de cobranças órfãs configurada com sucesso',
      schedule: 'Toda segunda-feira às 02:00 UTC (23:00 BRT domingo)',
      cron: cronSchedule,
      data
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error('[SETUP-ORPHAN-CHARGES] Error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

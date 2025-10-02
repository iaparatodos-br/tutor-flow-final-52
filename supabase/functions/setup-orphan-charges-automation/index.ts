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

    console.log('[SETUP-ORPHAN-CHARGES] Setting up orphan cancellation charges automation');

    // Verificar se extensões necessárias estão habilitadas
    const { data: extensions, error: extError } = await supabaseAdmin
      .rpc('pg_available_extensions');

    if (extError) {
      console.error('Error checking extensions:', extError);
    }

    const projectId = Deno.env.get("SUPABASE_URL")?.split('//')[1]?.split('.')[0];
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!projectId || !anonKey) {
      throw new Error('Missing required environment variables');
    }

    // Criar job cron para processar cobranças órfãs semanalmente (toda segunda-feira às 02:00)
    const cronSchedule = '0 2 * * 1'; // Segunda-feira às 02:00
    const functionUrl = `https://${projectId}.supabase.co/functions/v1/process-orphan-cancellation-charges`;

    const setupQuery = `
      -- Remover job existente se houver
      SELECT cron.unschedule('process-orphan-cancellation-charges-weekly')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'process-orphan-cancellation-charges-weekly'
      );

      -- Criar novo job
      SELECT cron.schedule(
        'process-orphan-cancellation-charges-weekly',
        '${cronSchedule}',
        $$
        SELECT net.http_post(
          url:='${functionUrl}',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
          body:=concat('{"timestamp": "', now(), '"}')::jsonb
        ) as request_id;
        $$
      );
    `;

    console.log('[SETUP-ORPHAN-CHARGES] Executing setup query');
    
    // Executar query de setup
    const { error: setupError } = await supabaseAdmin.rpc('exec_sql', {
      sql: setupQuery
    });

    if (setupError) {
      console.error('[SETUP-ORPHAN-CHARGES] Setup error:', setupError);
      
      // Se RPC não existir, tentar abordagem alternativa
      console.log('[SETUP-ORPHAN-CHARGES] Attempting alternative setup approach');
      
      return new Response(JSON.stringify({ 
        success: false,
        message: 'Por favor, execute o seguinte SQL manualmente no Supabase SQL Editor:',
        sql: setupQuery,
        error: setupError.message
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log('[SETUP-ORPHAN-CHARGES] Automation setup completed successfully');

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Automação de cobranças órfãs configurada com sucesso',
      schedule: 'Toda segunda-feira às 02:00 (Horário de Brasília)',
      cron: cronSchedule
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

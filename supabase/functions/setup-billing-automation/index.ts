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

    console.log("[SETUP-BILLING] Setting up billing automation cron job...");

    const functionUrl = `${supabaseUrl}/functions/v1/automated-billing`;

    // 1. Remover job existente (se houver)
    const { error: unscheduleError } = await supabaseAdmin.rpc('cron_unschedule', {
      p_jobname: 'automated-billing-daily'
    });

    if (unscheduleError) {
      console.log("[SETUP-BILLING] No existing job to remove (normal on first setup)");
    }

    // 2. Criar novo job - Daily at 12:00 PM UTC (9:00 AM Brasília)
    const { data, error } = await supabaseAdmin.rpc('cron_schedule', {
      p_jobname: 'automated-billing-daily',
      p_schedule: '0 12 * * *',
      p_command: `
        SELECT net.http_post(
          url:='${functionUrl}',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
          body:='{"source": "cron"}'::jsonb
        ) as request_id;
      `
    });

    if (error) {
      console.error("[SETUP-BILLING] Error setting up cron job:", error);
      throw error;
    }

    console.log("[SETUP-BILLING] Billing automation cron job setup completed:", data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Billing automation cron job setup completed",
        schedule: "Daily at 12:00 PM UTC (9:00 AM Brasília)",
        data
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("[SETUP-BILLING] Error setting up billing automation:", error);
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

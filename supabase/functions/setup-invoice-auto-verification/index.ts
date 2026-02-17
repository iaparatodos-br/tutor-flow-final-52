import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SETUP-AUTO-VERIFICATION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !anonKey) {
      throw new Error("Missing Supabase configuration");
    }

    logStep("Setting up automatic invoice verification cron job");

    const functionUrl = `${supabaseUrl}/functions/v1/auto-verify-pending-invoices`;

    // 1. Remover job existente se houver
    const { error: unscheduleError } = await supabaseClient.rpc('cron_unschedule', {
      p_jobname: 'auto-verify-pending-invoices'
    });

    if (unscheduleError) {
      logStep("No existing cron job to remove (normal on first setup)");
    }

    // 2. Criar novo cron job para rodar a cada 3 horas
    const { data, error } = await supabaseClient.rpc('cron_schedule', {
      p_jobname: 'auto-verify-pending-invoices',
      p_schedule: '0 */3 * * *',
      p_command: `
        SELECT net.http_post(
          url:='${functionUrl}',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
          body:='{}'::jsonb
        ) as request_id;
      `
    });

    if (error) {
      logStep("Error scheduling cron job", error);
      throw new Error(`Failed to schedule cron job: ${error.message}`);
    }

    logStep("Cron job scheduled successfully", { 
      jobname: 'auto-verify-pending-invoices',
      schedule: 'Every 3 hours'
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Automatic invoice verification cron job scheduled successfully",
      schedule: "Every 3 hours",
      jobname: "auto-verify-pending-invoices",
      data
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in setup-auto-verification", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

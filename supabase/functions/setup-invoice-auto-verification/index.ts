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
    logStep("Setting up automatic invoice verification cron job");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase configuration");
    }

    // Remover job existente se houver
    const { error: unscheduleError } = await supabaseClient.rpc('cron_unschedule', {
      p_jobname: 'auto-verify-pending-invoices'
    });

    if (unscheduleError) {
      logStep("Note: No existing cron job to remove (this is normal on first setup)");
    }

    // Criar novo cron job para rodar a cada 15 minutos
    const { data, error } = await supabaseClient.rpc('cron_schedule', {
      p_jobname: 'auto-verify-pending-invoices',
      p_schedule: '*/15 * * * *', // A cada 15 minutos
      p_command: `
        SELECT
          net.http_post(
            url:='${supabaseUrl}/functions/v1/auto-verify-pending-invoices',
            headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${supabaseAnonKey}"}'::jsonb,
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
      schedule: 'Every 15 minutes'
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Automatic invoice verification cron job scheduled successfully",
      schedule: "Every 15 minutes",
      jobname: "auto-verify-pending-invoices"
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

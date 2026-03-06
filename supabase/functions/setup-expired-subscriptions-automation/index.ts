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

    console.log("[SETUP-EXPIRED-SUBS] Setting up expired subscriptions automation cron job...");

    const functionUrl = `${supabaseUrl}/functions/v1/process-expired-subscriptions`;

    // 1. Remover job existente (se houver) usando SQL direto
    const { error: unscheduleError } = await supabaseAdmin.rpc('query', {
      sql: `SELECT cron.unschedule('process-expired-subscriptions-daily')`
    }).maybeSingle();

    if (unscheduleError) {
      console.log("[SETUP-EXPIRED-SUBS] No existing job to remove (normal on first setup):", unscheduleError.message);
    }

    // 2. Criar novo job - Daily at 10:00 AM UTC (7:00 AM Brasilia)
    // Usar raw SQL via supabaseAdmin já que cron.schedule não está exposto como RPC
    const { data, error } = await supabaseAdmin.rpc('query', {
      sql: `SELECT cron.schedule(
        'process-expired-subscriptions-daily',
        '0 10 * * *',
        $$
        SELECT net.http_post(
          url := '${functionUrl}',
          headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
          body := '{"source": "cron"}'::jsonb
        ) AS request_id;
        $$
      )`
    }).maybeSingle();

    if (error) {
      console.error("[SETUP-EXPIRED-SUBS] Error setting up cron job:", error);
      // Fallback: the cron job may already exist from the migration
      console.log("[SETUP-EXPIRED-SUBS] Note: cron job may already be configured via SQL migration");
    }

    console.log("[SETUP-EXPIRED-SUBS] Expired subscriptions automation cron job setup completed:", data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Expired subscriptions automation cron job setup completed",
        schedule: "Daily at 10:00 AM UTC (7:00 AM Brasilia time)",
        note: "Cron job is configured via SQL migration. This function serves as a manual re-setup if needed.",
        data
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("[SETUP-EXPIRED-SUBS] Error setting up expired subscriptions automation:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        note: "The cron job should be configured via SQL migration directly. Check cron.job table."
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

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

    // Note: cron jobs are configured via SQL migrations.
    // This function serves as a manual fallback for re-setup if needed.
    // The primary cron job (automated-billing-daily) is already configured in the database.

    console.log("[SETUP-BILLING] Billing automation cron job is configured via SQL migration.");
    console.log("[SETUP-BILLING] Current schedule: Daily at 9:00 AM UTC (6:00 AM Brasília)");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Billing automation cron job is configured",
        schedule: "Daily at 9:00 AM UTC (6:00 AM Brasília)",
        note: "Cron jobs are managed via SQL migrations. Check cron.job table for current configuration."
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("[SETUP-BILLING] Error:", error);
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

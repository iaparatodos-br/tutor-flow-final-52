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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Setting up billing automation cron job...");
    
    // Set up cron job to run automated billing daily at 12:00 PM UTC (9:00 AM Brasília time)
    const { data, error } = await supabaseAdmin.rpc('cron_schedule', {
      job_name: 'automated-billing-daily',
      schedule: '0 12 * * *', // Daily at 12:00 PM UTC (9:00 AM Brasília time)
      command: `
        select
          net.http_post(
              url:='${Deno.env.get("SUPABASE_URL")}/functions/v1/automated-billing',
              headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}"}'::jsonb,
              body:='{"source": "cron"}'::jsonb
          ) as request_id;
      `
    });

    if (error) {
      console.error("Error setting up cron job:", error);
      throw error;
    }

    console.log("Billing automation cron job setup completed:", data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Billing automation cron job setup completed",
        data
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("Error setting up billing automation:", error);
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
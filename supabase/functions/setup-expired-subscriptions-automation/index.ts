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
    console.log("Setting up expired subscriptions automation cron job...");
    
    // Set up cron job to run expired subscriptions check daily at 10:00 AM UTC (7:00 AM Brasilia)
    const { data, error } = await supabaseAdmin.rpc('cron_schedule', {
      job_name: 'process-expired-subscriptions-daily',
      schedule: '0 10 * * *', // Daily at 10:00 AM UTC = 7:00 AM Brasilia
      command: `
        select
          net.http_post(
              url:='${Deno.env.get("SUPABASE_URL")}/functions/v1/process-expired-subscriptions',
              headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}"}'::jsonb,
              body:='{"source": "cron"}'::jsonb
          ) as request_id;
      `
    });

    if (error) {
      console.error("Error setting up expired subscriptions cron job:", error);
      throw error;
    }

    console.log("Expired subscriptions automation cron job setup completed:", data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Expired subscriptions automation cron job setup completed",
        schedule: "Daily at 10:00 AM UTC (7:00 AM Brasilia time)",
        data
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("Error setting up expired subscriptions automation:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
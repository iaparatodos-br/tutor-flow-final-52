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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Fix class d76db8dc stuck in aguardando_pagamento
    const classId = 'd76db8dc-2ebb-4785-8aa7-133b1500b0b6';

    const { data: classUpdate, error: classError } = await supabaseClient
      .from('classes')
      .update({ status: 'confirmada', updated_at: new Date().toISOString() })
      .eq('id', classId)
      .eq('status', 'aguardando_pagamento')
      .select('id, status');

    const { data: partUpdate, error: partError } = await supabaseClient
      .from('class_participants')
      .update({ status: 'confirmada', confirmed_at: new Date().toISOString() })
      .eq('class_id', classId)
      .eq('status', 'aguardando_pagamento')
      .select('id, status');

    return new Response(JSON.stringify({
      class_updated: classUpdate,
      class_error: classError?.message,
      participants_updated: partUpdate,
      participants_error: partError?.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

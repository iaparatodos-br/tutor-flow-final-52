import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '7');
    const eventType = url.searchParams.get('event_type');
    const webhookFunction = url.searchParams.get('webhook_function');

    // Query para obter estatísticas de eventos processados
    let query = supabaseClient
      .from('processed_stripe_events')
      .select('*')
      .gte('processed_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('processed_at', { ascending: false });

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    if (webhookFunction) {
      query = query.eq('webhook_function', webhookFunction);
    }

    const { data: events, error } = await query;

    if (error) {
      throw error;
    }

    // Calcular estatísticas
    const stats = {
      total_events: events?.length || 0,
      by_type: {} as Record<string, number>,
      by_webhook: {} as Record<string, number>,
      by_action: {} as Record<string, number>,
      recent_events: events?.slice(0, 10) || [],
      processing_times: [] as number[]
    };

    events?.forEach(event => {
      // Contar por tipo
      stats.by_type[event.event_type] = (stats.by_type[event.event_type] || 0) + 1;
      
      // Contar por webhook
      stats.by_webhook[event.webhook_function] = (stats.by_webhook[event.webhook_function] || 0) + 1;
      
      // Contar por ação
      const action = event.processing_result?.action || 'unknown';
      stats.by_action[action] = (stats.by_action[action] || 0) + 1;
    });

    return new Response(JSON.stringify({
      success: true,
      period_days: days,
      stats,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Error in stripe-events-monitor:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
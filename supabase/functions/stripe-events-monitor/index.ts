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
      by_processing_status: {} as Record<string, number>,
      recent_events: events?.slice(0, 10) || [],
      processing_times: [] as number[],
      failed_events: events?.filter(e => e.processing_status === 'failed') || [],
      timeout_events: events?.filter(e => e.processing_status === 'timeout') || [],
      retry_stats: {
        total_retries: events?.reduce((sum, e) => sum + (e.retry_count || 0), 0) || 0,
        max_retries_reached: events?.filter(e => e.retry_count >= 3).length || 0
      }
    };

    events?.forEach(event => {
      // Contar por tipo
      stats.by_type[event.event_type] = (stats.by_type[event.event_type] || 0) + 1;
      
      // Contar por webhook
      stats.by_webhook[event.webhook_function] = (stats.by_webhook[event.webhook_function] || 0) + 1;
      
      // Contar por ação
      const action = event.processing_result?.action || 'unknown';
      stats.by_action[action] = (stats.by_action[action] || 0) + 1;
      
      // Contar por status de processamento
      const status = event.processing_status || 'unknown';
      stats.by_processing_status[status] = (stats.by_processing_status[status] || 0) + 1;
      
      // Calcular tempo de processamento se disponível
      if (event.processing_started_at && event.processing_completed_at) {
        const processingTime = new Date(event.processing_completed_at).getTime() - 
                              new Date(event.processing_started_at).getTime();
        stats.processing_times.push(processingTime);
      }
    });

    // Calcular estatísticas de tempo
    const timeStats = stats.processing_times.length > 0 ? {
      avg_processing_time_ms: stats.processing_times.reduce((a, b) => a + b, 0) / stats.processing_times.length,
      min_processing_time_ms: Math.min(...stats.processing_times),
      max_processing_time_ms: Math.max(...stats.processing_times)
    } : null;

    return new Response(JSON.stringify({
      success: true,
      period_days: days,
      stats,
      time_stats: timeStats,
      timestamp: new Date().toISOString(),
      health: {
        total_events: stats.total_events,
        success_rate: stats.total_events > 0 ? 
          ((stats.by_processing_status['completed'] || 0) / stats.total_events * 100).toFixed(2) + '%' : 'N/A',
        failure_rate: stats.total_events > 0 ? 
          ((stats.by_processing_status['failed'] || 0) / stats.total_events * 100).toFixed(2) + '%' : 'N/A',
        timeout_rate: stats.total_events > 0 ? 
          ((stats.by_processing_status['timeout'] || 0) / stats.total_events * 100).toFixed(2) + '%' : 'N/A',
        avg_processing_time: timeStats ? `${timeStats.avg_processing_time_ms.toFixed(0)}ms` : 'N/A'
      }
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
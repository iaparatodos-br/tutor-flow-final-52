import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuditLogRequest {
  action: string;
  details: Record<string, any>;
  metadata?: Record<string, any>;
}

export const logAuditEvent = async (
  supabaseClient: any,
  userId: string,
  action: string,
  details: Record<string, any>,
  metadata?: Record<string, any>
) => {
  try {
    const { error } = await supabaseClient
      .from('audit_logs')
      .insert({
        user_id: userId,
        action,
        details,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[AUDIT-LOG] Error inserting audit log:', error);
    } else {
      console.log(`[AUDIT-LOG] ${action} logged for user ${userId}`);
    }
  } catch (error) {
    console.error('[AUDIT-LOG] Exception logging audit event:', error);
  }
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error("Authentication failed");
    }

    const { action, details, metadata }: AuditLogRequest = await req.json();
    
    await logAuditEvent(supabaseClient, userData.user.id, action, details, metadata);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AUDIT-LOG] Error:', errorMessage);
    
    return new Response(JSON.stringify({ 
      success: false,
      message: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
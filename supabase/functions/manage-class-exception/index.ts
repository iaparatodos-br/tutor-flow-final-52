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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;

    const { original_class_id, exception_date, action, newData } = await req.json();
    
    if (!original_class_id || !exception_date || !action) {
      throw new Error("Missing required fields: original_class_id, exception_date, action");
    }

    // Validate that the user owns the original class
    const { data: originalClass, error: classError } = await supabase
      .from('classes')
      .select('id, teacher_id')
      .eq('id', original_class_id)
      .eq('teacher_id', user.id)
      .maybeSingle();

    if (classError) throw classError;
    if (!originalClass) throw new Error("Class not found or access denied");

    let exceptionData: any = {
      original_class_id,
      exception_date,
    };

    if (action === 'cancel') {
      exceptionData.status = 'canceled';
    } else if (action === 'reschedule') {
      if (!newData) throw new Error("newData is required for reschedule action");
      
      exceptionData.status = 'rescheduled';
      exceptionData.new_start_time = newData.start_time;
      exceptionData.new_end_time = newData.end_time;
      exceptionData.new_title = newData.title;
      exceptionData.new_description = newData.description;
      exceptionData.new_duration_minutes = newData.duration_minutes;
    } else {
      throw new Error("Invalid action. Must be 'cancel' or 'reschedule'");
    }

    const { data: exception, error: exceptionError } = await supabase
      .from('class_exceptions')
      .upsert(exceptionData, { 
        onConflict: 'original_class_id,exception_date',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (exceptionError) throw exceptionError;

    console.log(`Class exception ${action}ed successfully:`, exception);

    return new Response(JSON.stringify({ 
      success: true, 
      exception,
      message: action === 'cancel' ? 'Aula cancelada com sucesso' : 'Aula reagendada com sucesso'
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error('Error in manage-class-exception:', error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
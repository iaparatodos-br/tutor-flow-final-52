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

    // Get user profile to check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    // Validate that the user owns the original class
    const { data: originalClass, error: classError } = await supabase
      .from('classes')
      .select('id, teacher_id')
      .eq('id', original_class_id)
      .maybeSingle();

    if (classError) throw classError;
    if (!originalClass) throw new Error("Class not found");

    // Authorization: professor must own the class, student must be participant or responsible
    let isAuthorized = false;
    
    if (profile?.role === 'professor') {
      // Professor must be the teacher
      isAuthorized = originalClass.teacher_id === user.id;
    } else if (profile?.role === 'aluno') {
      // Student must be participant or responsible for a dependent participant
      const { data: participation } = await supabase
        .from('class_participants')
        .select('id, student_id, dependent_id')
        .eq('class_id', original_class_id)
        .eq('student_id', user.id)
        .maybeSingle();
      
      if (participation) {
        isAuthorized = true;
      } else {
        // Check if user is responsible for any dependent participant
        const { data: dependentParticipation } = await supabase
          .from('class_participants')
          .select(`
            id,
            dependent_id,
            dependents!class_participants_dependent_id_fkey(responsible_id)
          `)
          .eq('class_id', original_class_id)
          .not('dependent_id', 'is', null);
        
        if (dependentParticipation) {
          for (const p of dependentParticipation) {
            const dep = p.dependents as any;
            if (dep?.responsible_id === user.id) {
              isAuthorized = true;
              break;
            }
          }
        }
      }
    }

    if (!isAuthorized) {
      throw new Error("Access denied: you cannot manage exceptions for this class");
    }
    
    console.log(`✅ User ${user.id} authorized to manage exception for class ${original_class_id}`);

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
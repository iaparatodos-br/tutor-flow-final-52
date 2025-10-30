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

    const body = await req.json();
    console.log("Request body:", JSON.stringify(body, null, 2));
    
    const { teacherId, datetime, serviceId, notes } = body;
    console.log("Parsed values:", { teacherId, datetime, serviceId, notes });
    
    if (!teacherId || !datetime || !serviceId) {
      console.error("Missing required fields:", { teacherId, datetime, serviceId });
      throw new Error(`Missing required fields: teacherId=${teacherId}, datetime=${datetime}, serviceId=${serviceId}`);
    }

    // Student derived from auth user; ignoring any provided studentId

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) throw new Error("Profile not found");
    if (profile.role !== 'aluno') throw new Error("Only students can request classes");
    
    // Check if student is associated with this teacher
    const { data: relationship, error: relationshipError } = await supabase
      .from('teacher_student_relationships')
      .select('id')
      .eq('student_id', user.id)
      .eq('teacher_id', teacherId)
      .maybeSingle();
      
    if (relationshipError) {
      console.error("Error checking teacher-student relationship:", relationshipError);
      throw relationshipError;
    }
    if (!relationship) {
      console.error("No active relationship found between student and teacher:", { studentId: user.id, teacherId });
      throw new Error("Student is not assigned to this teacher");
    }

    // Load service to get duration
    const { data: service, error: serviceError } = await supabase
      .from('class_services')
      .select('id, duration_minutes')
      .eq('id', serviceId)
      .eq('teacher_id', teacherId)
      .eq('is_active', true)
      .maybeSingle();

    if (serviceError) throw serviceError;
    if (!service) throw new Error("Serviço inválido");

    const { data: newClass, error: insertError } = await supabase
      .from('classes')
      .insert({
        teacher_id: teacherId,
        // student_id removed - use class_participants instead
        class_date: new Date(datetime).toISOString(),
        duration_minutes: service.duration_minutes,
        service_id: serviceId,
        status: 'pendente',
        notes: notes?.trim() || null,
        is_experimental: false,
        is_group_class: false
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Create participant record
    const { error: participantError } = await supabase
      .from('class_participants')
      .insert({
        class_id: newClass.id,
        student_id: user.id,
        status: 'pendente'
      });

    if (participantError) throw participantError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
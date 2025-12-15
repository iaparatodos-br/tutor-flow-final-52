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
    console.log("📚 Request body:", JSON.stringify(body, null, 2));
    
    // NEW: Accept dependent_id in payload
    const { teacherId, datetime, serviceId, notes, dependent_id } = body;
    console.log("Parsed values:", { teacherId, datetime, serviceId, notes, dependent_id });
    
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

    // NEW: If dependent_id is provided, validate ownership
    let validatedDependentId: string | null = null;
    let dependentName: string | null = null;
    
    if (dependent_id) {
      console.log("🔍 Validating dependent ownership:", dependent_id);
      
      const { data: dependent, error: dependentError } = await supabase
        .from('dependents')
        .select('id, name, responsible_id, teacher_id')
        .eq('id', dependent_id)
        .maybeSingle();
      
      if (dependentError) {
        console.error("Error fetching dependent:", dependentError);
        throw new Error("Error validating dependent");
      }
      
      if (!dependent) {
        console.error("Dependent not found:", dependent_id);
        throw new Error("Dependent not found");
      }
      
      // Validate that the authenticated user is the responsible
      if (dependent.responsible_id !== user.id) {
        console.error("User is not the responsible for this dependent:", {
          user_id: user.id,
          responsible_id: dependent.responsible_id
        });
        throw new Error("You are not the responsible for this dependent");
      }
      
      // Validate that the dependent belongs to this teacher
      if (dependent.teacher_id !== teacherId) {
        console.error("Dependent does not belong to this teacher:", {
          dependent_teacher_id: dependent.teacher_id,
          requested_teacher_id: teacherId
        });
        throw new Error("Dependent is not associated with this teacher");
      }
      
      validatedDependentId = dependent.id;
      dependentName = dependent.name;
      console.log("✅ Dependent validated:", { id: validatedDependentId, name: dependentName });
    }

    // Load service to get duration and name
    const { data: service, error: serviceError } = await supabase
      .from('class_services')
      .select('id, name, duration_minutes')
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

    // Create participant record with optional dependent_id
    const participantData: {
      class_id: string;
      student_id: string;
      status: string;
      dependent_id?: string;
    } = {
      class_id: newClass.id,
      student_id: user.id,
      status: 'pendente'
    };
    
    if (validatedDependentId) {
      participantData.dependent_id = validatedDependentId;
    }
    
    const { error: participantError } = await supabase
      .from('class_participants')
      .insert(participantData);

    if (participantError) throw participantError;

    // Send notification to teacher (non-blocking)
    // NEW: Include dependent info in notification
    supabase.functions
      .invoke("send-class-request-notification", {
        body: {
          class_id: newClass.id,
          teacher_id: teacherId,
          student_id: user.id,
          dependent_id: validatedDependentId,
          dependent_name: dependentName,
          service_name: service.name || "Serviço",
          class_date: newClass.class_date,
          duration_minutes: service.duration_minutes,
          notes: notes?.trim() || null,
        },
      })
      .then(({ error: notifError }) => {
        if (notifError) {
          console.error("Error sending class request notification (non-critical):", notifError);
        } else {
          console.log("✅ Class request notification sent successfully");
        }
      })
      .catch((err) => {
        console.error("Error invoking notification function (non-critical):", err);
      });

    console.log("✅ Class request created successfully:", {
      class_id: newClass.id,
      dependent_id: validatedDependentId,
      dependent_name: dependentName
    });

    return new Response(JSON.stringify({ 
      success: true,
      class_id: newClass.id,
      dependent_id: validatedDependentId
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ Error in request-class:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

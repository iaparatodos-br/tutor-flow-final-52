import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyBusinessProfileOwnership } from "../_shared/business-profile-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CLASS] ${step}${detailsStr}`);
};

interface CreateClassRequest {
  business_profile_id: string;
  student_id: string;
  class_date: string;
  duration_minutes?: number;
  notes?: string;
  service_id?: string;
  is_group_class?: boolean;
  is_experimental?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body: CreateClassRequest = await req.json();
    const { 
      business_profile_id, 
      student_id, 
      class_date, 
      duration_minutes = 60,
      notes,
      service_id,
      is_group_class = false,
      is_experimental = false
    } = body;
    
    if (!business_profile_id || !student_id || !class_date) {
      return new Response(JSON.stringify({ 
        success: false,
        error: "business_profile_id, student_id, and class_date are required" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Verify business profile ownership
    const authHeader = req.headers.get("Authorization");
    const ownershipCheck = await verifyBusinessProfileOwnership(
      supabaseClient, 
      authHeader, 
      business_profile_id
    );

    if (!ownershipCheck.success) {
      return new Response(JSON.stringify({ 
        success: false,
        error: ownershipCheck.error 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const teacherId = ownershipCheck.user?.id;
    logStep("Business profile ownership verified", { 
      businessProfileId: business_profile_id,
      teacherId
    });

    // Verify that the student belongs to this business profile
    const { data: studentRelationship, error: relationshipError } = await supabaseClient
      .from("teacher_student_relationships")
      .select("id")
      .eq("business_profile_id", business_profile_id)
      .eq("teacher_id", teacherId)
      .eq("student_id", student_id)
      .maybeSingle();

    if (relationshipError || !studentRelationship) {
      return new Response(JSON.stringify({ 
        success: false,
        error: "Student doesn't belong to this business profile" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    logStep("Student relationship verified");

    // Create the class
    const { data: newClass, error: createError } = await supabaseClient
      .from("classes")
      .insert({
        teacher_id: teacherId,
        student_id: student_id,
        business_profile_id: business_profile_id,
        class_date: class_date,
        duration_minutes: duration_minutes,
        notes: notes || null,
        service_id: service_id || null,
        is_group_class: is_group_class,
        is_experimental: is_experimental,
        status: 'pendente'
      })
      .select(`
        id,
        teacher_id,
        student_id,
        business_profile_id,
        class_date,
        duration_minutes,
        status,
        notes,
        is_group_class,
        is_experimental,
        created_at,
        student:profiles!student_id (
          id,
          name,
          email
        )
      `)
      .single();

    if (createError) {
      logStep("Error creating class", createError);
      throw new Error(`Database error: ${createError.message}`);
    }

    logStep("Class created successfully", { 
      classId: newClass.id,
      studentId: student_id,
      classDate: class_date
    });

    return new Response(JSON.stringify({
      success: true,
      class: newClass
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-class", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
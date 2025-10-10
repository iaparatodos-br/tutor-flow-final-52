import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

interface UpdateStudentRequest {
  student_id: string;
  teacher_id: string;
  relationship_id: string;
  student_name?: string;
  guardian_name?: string | null;
  guardian_email?: string | null;
  guardian_phone?: string | null;
  guardian_cpf?: string | null;
  guardian_address_street?: string | null;
  guardian_address_city?: string | null;
  guardian_address_state?: string | null;
  guardian_address_postal_code?: string | null;
  billing_day?: number | null;
  business_profile_id?: string | null;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UPDATE-STUDENT-DETAILS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: UpdateStudentRequest = await req.json();
    logStep("Function called", { body });

    if (!body?.student_id || !body?.teacher_id || !body?.relationship_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Campos obrigatórios: student_id, teacher_id e relationship_id" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify that the teacher owns this relationship
    const { data: relationship, error: relationshipError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select('*')
      .eq('id', body.relationship_id)
      .eq('teacher_id', body.teacher_id)
      .eq('student_id', body.student_id)
      .single();

    if (relationshipError || !relationship) {
      logStep("Relationship verification failed", { error: relationshipError });
      return new Response(
        JSON.stringify({ success: false, error: "Relacionamento não encontrado ou acesso negado" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Prepare update data for teacher_student_relationships
    const updateData: any = {};
    
    if (body.student_name !== undefined) updateData.student_name = body.student_name;
    if (body.guardian_name !== undefined) updateData.student_guardian_name = body.guardian_name;
    if (body.guardian_email !== undefined) updateData.student_guardian_email = body.guardian_email;
    if (body.guardian_phone !== undefined) updateData.student_guardian_phone = body.guardian_phone;
    if (body.guardian_cpf !== undefined) updateData.student_guardian_cpf = body.guardian_cpf;
    if (body.guardian_address_street !== undefined) updateData.student_guardian_address_street = body.guardian_address_street;
    if (body.guardian_address_city !== undefined) updateData.student_guardian_address_city = body.guardian_address_city;
    if (body.guardian_address_state !== undefined) updateData.student_guardian_address_state = body.guardian_address_state;
    if (body.guardian_address_postal_code !== undefined) updateData.student_guardian_address_postal_code = body.guardian_address_postal_code;
    if (body.billing_day !== undefined) updateData.billing_day = body.billing_day;
    if (body.business_profile_id !== undefined) updateData.business_profile_id = body.business_profile_id;

    // Update teacher_student_relationships
    const { error: updateRelationshipError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .update(updateData)
      .eq('id', body.relationship_id);

    if (updateRelationshipError) {
      logStep("Error updating relationship", { error: updateRelationshipError });
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao atualizar dados do relacionamento" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Guardian data is now stored ONLY in teacher_student_relationships table
    // No longer updating profiles table for guardian information

    logStep("Student details updated successfully", { relationshipId: body.relationship_id });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Dados do aluno atualizados com sucesso'
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    logStep("Error in update-student-details", { error: error.message });
    
    return new Response(
      JSON.stringify({ success: false, error: 'Erro inesperado ao atualizar dados do aluno' }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
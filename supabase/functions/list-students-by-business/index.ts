import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyBusinessProfileOwnership } from "../_shared/business-profile-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LIST-STUDENTS-BY-BUSINESS] ${step}${detailsStr}`);
};

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

    const { business_profile_id } = await req.json();
    
    if (!business_profile_id) {
      return new Response(JSON.stringify({ 
        success: false,
        error: "business_profile_id is required" 
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

    logStep("Business profile ownership verified", { 
      businessProfileId: business_profile_id,
      userId: ownershipCheck.user?.id 
    });

    // Get all student relationships for this business profile
    const { data: studentRelationships, error: fetchError } = await supabaseClient
      .from("teacher_student_relationships")
      .select(`
        id,
        student_id,
        student_name,
        student_guardian_name,
        student_guardian_email,
        student_guardian_phone,
        billing_day,
        stripe_customer_id,
        created_at,
        updated_at,
        student:profiles!student_id (
          id,
          name,
          email,
          cpf,
          guardian_name,
          guardian_email,
          guardian_phone,
          address_street,
          address_city,
          address_state,
          address_postal_code,
          address_complete
        )
      `)
      .eq("business_profile_id", business_profile_id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      logStep("Error fetching student relationships", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    logStep("Student relationships fetched successfully", { 
      count: studentRelationships?.length || 0
    });

    return new Response(JSON.stringify({
      success: true,
      students: studentRelationships || [],
      count: studentRelationships?.length || 0
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in list-students-by-business", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyBusinessProfileOwnership } from "../_shared/business-profile-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LIST-CLASSES-BY-BUSINESS] ${step}${detailsStr}`);
};

interface ListClassesRequest {
  business_profile_id: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  student_id?: string;
  limit?: number;
  offset?: number;
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

    const body: ListClassesRequest = await req.json();
    const { 
      business_profile_id, 
      start_date, 
      end_date, 
      status, 
      student_id,
      limit = 50,
      offset = 0 
    } = body;
    
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

    // Build query with filters
    let query = supabaseClient
      .from("classes")
      .select(`
        id,
        teacher_id,
        student_id,
        class_date,
        duration_minutes,
        status,
        notes,
        invoice_id,
        is_group_class,
        is_experimental,
        cancelled_at,
        cancellation_reason,
        created_at,
        updated_at,
        student:profiles!student_id (
          id,
          name,
          email
        ),
        class_services (
          id,
          name,
          price,
          duration_minutes
        ),
        class_reports (
          id,
          content,
          homework,
          extra_materials,
          created_at
        )
      `)
      .eq("business_profile_id", business_profile_id);

    // Apply filters
    if (start_date) {
      query = query.gte("class_date", start_date);
    }
    if (end_date) {
      query = query.lte("class_date", end_date);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (student_id) {
      query = query.eq("student_id", student_id);
    }

    // Apply pagination and ordering
    query = query
      .order("class_date", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: classes, error: fetchError } = await query;

    if (fetchError) {
      logStep("Error fetching classes", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    logStep("Classes fetched successfully", { 
      count: classes?.length || 0,
      filters: { start_date, end_date, status, student_id }
    });

    return new Response(JSON.stringify({
      success: true,
      classes: classes || [],
      count: classes?.length || 0,
      pagination: {
        limit,
        offset,
        hasMore: (classes?.length || 0) === limit
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in list-classes-by-business", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
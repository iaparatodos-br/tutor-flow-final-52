import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyBusinessProfileOwnership } from "../_shared/business-profile-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LIST-MATERIALS-BY-BUSINESS] ${step}${detailsStr}`);
};

interface ListMaterialsRequest {
  business_profile_id: string;
  category_id?: string;
  search?: string;
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

    const body: ListMaterialsRequest = await req.json();
    const { 
      business_profile_id, 
      category_id,
      search,
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
      .from("materials")
      .select(`
        id,
        teacher_id,
        category_id,
        title,
        description,
        file_name,
        file_path,
        file_size,
        file_type,
        created_at,
        updated_at,
        material_categories (
          id,
          name,
          color
        )
      `)
      .eq("business_profile_id", business_profile_id);

    // Apply filters
    if (category_id) {
      query = query.eq("category_id", category_id);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply pagination and ordering
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: materials, error: fetchError } = await query;

    if (fetchError) {
      logStep("Error fetching materials", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    logStep("Materials fetched successfully", { 
      count: materials?.length || 0,
      filters: { category_id, search }
    });

    return new Response(JSON.stringify({
      success: true,
      materials: materials || [],
      count: materials?.length || 0,
      pagination: {
        limit,
        offset,
        hasMore: (materials?.length || 0) === limit
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in list-materials-by-business", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
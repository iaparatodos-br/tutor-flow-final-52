import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LIST-BUSINESS-PROFILES] ${step}${detailsStr}`);
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Get all business profiles for the authenticated user
    const { data: businessProfiles, error: fetchError } = await supabaseClient
      .from("business_profiles")
      .select(`
        id,
        business_name,
        cnpj,
        stripe_connect_id,
        is_active,
        created_at,
        updated_at
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (fetchError) {
      logStep("Error fetching business profiles", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    logStep("Business profiles fetched successfully", { 
      count: businessProfiles?.length || 0,
      profiles: businessProfiles?.map(bp => ({ id: bp.id, name: bp.business_name })) 
    });

    return new Response(JSON.stringify({
      success: true,
      business_profiles: businessProfiles || [],
      count: businessProfiles?.length || 0
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in list-business-profiles", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
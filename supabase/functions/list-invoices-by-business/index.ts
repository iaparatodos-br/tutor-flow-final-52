import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyBusinessProfileOwnership } from "../_shared/business-profile-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LIST-INVOICES-BY-BUSINESS] ${step}${detailsStr}`);
};

interface ListInvoicesRequest {
  business_profile_id: string;
  status?: string;
  student_id?: string;
  start_date?: string;
  end_date?: string;
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

    const body: ListInvoicesRequest = await req.json();
    const { 
      business_profile_id, 
      status, 
      student_id,
      start_date,
      end_date,
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
      .from("invoices")
      .select(`
        id,
        teacher_id,
        student_id,
        amount,
        status,
        due_date,
        description,
        invoice_type,
        stripe_invoice_id,
        stripe_hosted_invoice_url,
        payment_due_date,
        billing_period_start,
        billing_period_end,
        created_at,
        updated_at,
        student:profiles!student_id (
          id,
          name,
          email,
          guardian_name,
          guardian_email
        )
      `)
      .eq("business_profile_id", business_profile_id);

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (student_id) {
      query = query.eq("student_id", student_id);
    }
    if (start_date) {
      query = query.gte("created_at", start_date);
    }
    if (end_date) {
      query = query.lte("created_at", end_date);
    }

    // Apply pagination and ordering
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: invoices, error: fetchError } = await query;

    if (fetchError) {
      logStep("Error fetching invoices", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    logStep("Invoices fetched successfully", { 
      count: invoices?.length || 0,
      filters: { status, student_id, start_date, end_date }
    });

    return new Response(JSON.stringify({
      success: true,
      invoices: invoices || [],
      count: invoices?.length || 0,
      pagination: {
        limit,
        offset,
        hasMore: (invoices?.length || 0) === limit
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in list-invoices-by-business", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
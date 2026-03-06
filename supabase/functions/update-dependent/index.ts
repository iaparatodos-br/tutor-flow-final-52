import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateDependentRequest {
  dependent_id: string;
  name?: string;
  birth_date?: string | null;
  notes?: string | null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get auth header for user verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with service role for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create client with user token for auth verification
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`User ${userId} updating dependent`);

    // Parse request body
    const body: UpdateDependentRequest = await req.json();
    console.log('Request body:', JSON.stringify(body));

    // Validate required fields
    if (!body.dependent_id) {
      return new Response(
        JSON.stringify({ error: 'dependent_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the dependent exists and user has permission
    const { data: dependent, error: depError } = await supabaseAdmin
      .from('dependents')
      .select('id, teacher_id, responsible_id, name')
      .eq('id', body.dependent_id)
      .maybeSingle();

    if (depError || !dependent) {
      console.error('Dependent not found:', depError);
      return new Response(
        JSON.stringify({ error: 'Dependent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check permission: must be the teacher who owns this dependent
    if (dependent.teacher_id !== userId) {
      console.error(`User ${userId} does not own dependent ${body.dependent_id}`);
      return new Response(
        JSON.stringify({ error: 'You do not have permission to update this dependent' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build update object
    const updateData: Record<string, any> = {};
    
    if (body.name !== undefined && body.name.trim()) {
      updateData.name = body.name.trim();
    }
    
    if (body.birth_date !== undefined) {
      updateData.birth_date = body.birth_date;
    }
    
    if (body.notes !== undefined) {
      updateData.notes = body.notes?.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid fields to update' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the dependent
    const { data: updatedDependent, error: updateError } = await supabaseAdmin
      .from('dependents')
      .update(updateData)
      .eq('id', body.dependent_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating dependent:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update dependent', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Dependent updated successfully: ${updatedDependent.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        dependent: updatedDependent
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

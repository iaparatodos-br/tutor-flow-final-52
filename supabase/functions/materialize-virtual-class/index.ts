import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MaterializeRequest {
  template_id: string;
  class_date: string;
  cancellation_reason?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 [materialize-virtual-class] Request received');

    // Initialize Supabase client with service role key for RLS bypass
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error('❌ No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'No authorization header provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !userData.user) {
      console.error('❌ Authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = userData.user;
    console.log('✅ Authenticated user:', user.id);

    // Verify user is a student
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile.role !== 'aluno') {
      console.error('❌ User is not a student:', profile?.role);
      return new Response(
        JSON.stringify({ error: 'Only students can materialize classes' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: MaterializeRequest = await req.json();
    const { template_id, class_date, cancellation_reason } = body;

    console.log('🔍 Request details:', { template_id, class_date, student_id: user.id, cancellation_reason });

    if (!template_id || !class_date) {
      console.error('❌ Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: template_id and class_date' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate template exists and is active
    const { data: template, error: templateError } = await supabaseClient
      .from('classes')
      .select('*')
      .eq('id', template_id)
      .eq('is_template', true)
      .maybeSingle();

    if (templateError) {
      console.error('❌ Error fetching template:', templateError);
      return new Response(
        JSON.stringify({ error: 'Error fetching template' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!template) {
      console.error('❌ Template not found');
      return new Response(
        JSON.stringify({ error: 'Template not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Template found:', template.id);

    // Check if template has expired
    if (template.recurrence_end_date) {
      const endDate = new Date(template.recurrence_end_date);
      if (endDate < new Date()) {
        console.error('❌ Template has expired:', template.recurrence_end_date);
        return new Response(
          JSON.stringify({ error: 'Template has expired' }),
          { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Verify student is a participant of the template
    const { data: participation, error: participationError } = await supabaseClient
      .from('class_participants')
      .select('id')
      .eq('class_id', template_id)
      .eq('student_id', user.id)
      .maybeSingle();

    if (participationError) {
      console.error('❌ Error checking participation:', participationError);
      return new Response(
        JSON.stringify({ error: 'Error checking participation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!participation) {
      console.error('❌ Student is not a participant of this template');
      return new Response(
        JSON.stringify({ error: 'Student is not a participant of this template' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Student participation verified');

    // Get all participants from the template
    const { data: templateParticipants, error: participantsError } = await supabaseClient
      .from('class_participants')
      .select('student_id, status')
      .eq('class_id', template_id);

    if (participantsError || !templateParticipants || templateParticipants.length === 0) {
      console.error('❌ Error fetching template participants or no participants found:', participantsError);
      return new Response(
        JSON.stringify({ error: 'Template has no participants' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Found template participants:', templateParticipants.length);

    // Insert materialized class (using service role to bypass RLS)
    const { data: materializedClass, error: insertError } = await supabaseClient
      .from('classes')
      .insert({
        teacher_id: template.teacher_id,
        class_date: class_date,
        duration_minutes: template.duration_minutes,
        status: template.status, // Herdar status do template original
        is_experimental: template.is_experimental,
        is_group_class: template.is_group_class,
        service_id: template.service_id,
        is_template: false,
        class_template_id: template_id,
        notes: template.notes,
      })
      .select()
      .single();

    if (insertError || !materializedClass) {
      console.error('❌ Error creating materialized class:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create materialized class', details: insertError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Materialized class created:', materializedClass.id);

    // Log inherited statuses for debugging
    console.log('🔍 Materializing with inherited status:', {
      template_status: template.status,
      materialized_status: template.status,
      participants_statuses: templateParticipants.map(p => ({ 
        student_id: p.student_id, 
        status: p.status 
      }))
    });

    // Copy all participants to the materialized class (preserving their status)
    const participantsToInsert = templateParticipants.map(p => ({
      class_id: materializedClass.id,
      student_id: p.student_id,
      status: p.status, // Preservar status original de cada participante
    }));

    const { error: participantInsertError } = await supabaseClient
      .from('class_participants')
      .insert(participantsToInsert);

    if (participantInsertError) {
      console.error('❌ Error copying participants:', participantInsertError);
      // Rollback: delete the materialized class
      await supabaseClient.from('classes').delete().eq('id', materializedClass.id);
      return new Response(
        JSON.stringify({ error: 'Failed to copy participants', details: participantInsertError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Copied participants:', participantsToInsert.length);

    return new Response(
      JSON.stringify({
        success: true,
        materialized_class_id: materializedClass.id,
        participants_count: participantsToInsert.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

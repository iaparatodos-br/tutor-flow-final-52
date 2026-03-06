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
  dependent_id?: string;
}

/**
 * Get the current date/time as seen in a specific timezone.
 * Returns a Date object representing "now" in UTC, useful for comparison with timestamptz.
 */
function getNowInTimezone(timezone: string): Date {
  // We just need to compare the recurrence_end_date (which is stored as a date/timestamptz)
  // against "now" interpreted in the teacher's timezone.
  // Since recurrence_end_date is stored as timestamptz, we can compare it against Date.now() directly.
  // But for date-only fields, we need the local "today" in the teacher's timezone.
  const now = new Date();
  const localDateStr = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  
  // Return end-of-day in the teacher's local timezone as a UTC instant
  // Parse the local date
  const [year, month, day] = localDateStr.split('-').map(Number);
  
  // Get timezone offset for this date
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  });
  const parts = formatter.formatToParts(now);
  const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || '+00:00';
  const offsetMatch = tzPart.match(/GMT([+-])(\d{2}):(\d{2})/);
  let offsetMinutes = 0;
  if (offsetMatch) {
    const sign = offsetMatch[1] === '+' ? 1 : -1;
    offsetMinutes = sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3]));
  }
  
  // End of today local = start of tomorrow local in UTC
  const endOfDayUtcMs = Date.UTC(year, month - 1, day + 1, 0, 0, 0) - offsetMinutes * 60 * 1000;
  return new Date(endOfDayUtcMs);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 [materialize-virtual-class] Request received');

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

    // Get user profile to check role
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('❌ Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ User role:', profile.role);

    // Parse request body
    const body: MaterializeRequest = await req.json();
    const { template_id, class_date, cancellation_reason, dependent_id } = body;

    console.log('🔍 Request details:', { template_id, class_date, student_id: user.id, cancellation_reason, dependent_id });

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

    // Validate dependent if provided
    let validatedDependentId: string | null = null;
    if (dependent_id && profile.role === 'aluno') {
      console.log('🔍 Validating dependent for responsible:', dependent_id);
      
      const { data: dependent, error: dependentError } = await supabaseClient
        .from('dependents')
        .select('id, name, responsible_id, teacher_id')
        .eq('id', dependent_id)
        .maybeSingle();
      
      if (dependentError || !dependent) {
        console.error('❌ Dependent not found:', dependentError);
        return new Response(
          JSON.stringify({ error: 'Dependent not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (dependent.responsible_id !== user.id) {
        console.error('❌ User is not responsible for dependent');
        return new Response(
          JSON.stringify({ error: 'You are not the responsible for this dependent' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (dependent.teacher_id !== template.teacher_id) {
        console.error('❌ Dependent does not belong to template teacher');
        return new Response(
          JSON.stringify({ error: 'Dependent is not associated with this teacher' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      validatedDependentId = dependent.id;
      console.log('✅ Dependent validated:', dependent.name);
    }

    // Authorization check based on user role
    if (profile.role === 'aluno') {
      const { data: participationRows, error: participationError } = await supabaseClient
        .from('class_participants')
        .select('id, student_id, dependent_id')
        .eq('class_id', template_id)
        .eq('student_id', user.id)
        .limit(1);
      
      const participation = participationRows && participationRows.length > 0 ? participationRows[0] : null;

      if (participationError) {
        console.error('❌ Error checking participation:', participationError);
        return new Response(
          JSON.stringify({ error: 'Error checking participation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (validatedDependentId) {
        const { data: dependentParticipation } = await supabaseClient
          .from('class_participants')
          .select('id')
          .eq('class_id', template_id)
          .eq('student_id', user.id)
          .eq('dependent_id', validatedDependentId)
          .maybeSingle();
        
        if (!dependentParticipation) {
          console.error('❌ Dependent is not a participant of this template');
          return new Response(
            JSON.stringify({ error: 'Dependent is not a participant of this template' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log('✅ Dependent participation verified');
      } else if (!participation) {
        console.error('❌ Student is not a participant of this template');
        return new Response(
          JSON.stringify({ error: 'Student is not a participant of this template' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ Student/responsible participation verified');
      
    } else if (profile.role === 'professor') {
      if (template.teacher_id !== user.id) {
        console.error('❌ Professor does not own this template');
        return new Response(
          JSON.stringify({ error: 'You can only materialize your own classes' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ Professor ownership verified');
      
    } else {
      console.error('❌ Invalid user role:', profile.role);
      return new Response(
        JSON.stringify({ error: 'Invalid user role' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if template has expired — using teacher's timezone
    if (template.recurrence_end_date) {
      // Buscar timezone do professor dono do template
      const { data: teacherProfile } = await supabaseClient
        .from('profiles')
        .select('timezone')
        .eq('id', template.teacher_id)
        .maybeSingle();
      
      const teacherTimezone = teacherProfile?.timezone || 'America/Sao_Paulo';
      
      // Compare teacher's local "today" date against the stored end date
      // recurrence_end_date is stored as timestamptz (midnight UTC for the date)
      const teacherTodayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: teacherTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()); // teacher's local date: "YYYY-MM-DD"
      
      const endDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(template.recurrence_end_date)); // end date as stored: "YYYY-MM-DD"
      
      console.log(`🔍 Expiration check: endDateStr=${endDateStr}, teacherTodayStr=${teacherTodayStr}, tz=${teacherTimezone}`);
      
      if (teacherTodayStr > endDateStr) {
        console.error('❌ Template has expired:', template.recurrence_end_date, `(teacher today: ${teacherTodayStr})`);
        return new Response(
          JSON.stringify({ error: 'Template has expired' }),
          { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get all participants from the template
    const { data: templateParticipants, error: participantsError } = await supabaseClient
      .from('class_participants')
      .select('student_id, status, dependent_id')
      .eq('class_id', template_id);

    if (participantsError || !templateParticipants || templateParticipants.length === 0) {
      console.error('❌ Error fetching template participants or no participants found:', participantsError);
      return new Response(
        JSON.stringify({ error: 'Template has no participants' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Found template participants:', templateParticipants.length);

    // Insert materialized class
    const { data: materializedClass, error: insertError } = await supabaseClient
      .from('classes')
      .insert({
        teacher_id: template.teacher_id,
        class_date: class_date,
        duration_minutes: template.duration_minutes,
        status: template.status,
        is_experimental: template.is_experimental,
        is_group_class: template.is_group_class,
        is_paid_class: template.is_paid_class,
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

    // Copy all participants to the materialized class
    const participantsToInsert = templateParticipants.map(p => {
      const participant: {
        class_id: string;
        student_id: string;
        status: string;
        dependent_id?: string;
      } = {
        class_id: materializedClass.id,
        student_id: p.student_id,
        status: p.status,
      };
      
      if (p.dependent_id) {
        participant.dependent_id = p.dependent_id;
      }
      
      return participant;
    });

    const { error: participantInsertError } = await supabaseClient
      .from('class_participants')
      .insert(participantsToInsert);

    if (participantInsertError) {
      console.error('❌ Error copying participants:', participantInsertError);
      await supabaseClient.from('classes').delete().eq('id', materializedClass.id);
      return new Response(
        JSON.stringify({ error: 'Failed to copy participants', details: participantInsertError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Copied participants (with dependents):', participantsToInsert.length);

    // Buscar perfis dos participantes e dependentes para retorno
    const participantsWithProfiles = [];
    for (const p of templateParticipants) {
      const { data: studentProfile } = await supabaseClient
        .from('profiles')
        .select('id, name, email')
        .eq('id', p.student_id)
        .maybeSingle();
      
      let dependentInfo = null;
      if (p.dependent_id) {
        const { data: dependent } = await supabaseClient
          .from('dependents')
          .select('id, name')
          .eq('id', p.dependent_id)
          .maybeSingle();
        
        if (dependent) {
          dependentInfo = { id: dependent.id, name: dependent.name };
        }
      }
      
      if (studentProfile) {
        participantsWithProfiles.push({
          student_id: p.student_id,
          dependent_id: p.dependent_id,
          profile: studentProfile,
          dependent: dependentInfo
        });
      }
    }

    console.log('✅ Fetched participant profiles:', participantsWithProfiles.length);

    return new Response(
      JSON.stringify({
        success: true,
        materialized_class_id: materializedClass.id,
        participants_count: participantsToInsert.length,
        participants: participantsWithProfiles,
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

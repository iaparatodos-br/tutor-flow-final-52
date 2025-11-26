import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[RESEND-STUDENT-INVITATION] Function started');

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[RESEND-STUDENT-INVITATION] No authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        },
        auth: {
          persistSession: false
        }
      }
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('[RESEND-STUDENT-INVITATION] User not authenticated:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RESEND-STUDENT-INVITATION] Authenticated teacher:', user.id);

    // Parse request body
    const { student_id, relationship_id } = await req.json();

    if (!student_id || !relationship_id) {
      console.error('[RESEND-STUDENT-INVITATION] Missing required fields');
      return new Response(
        JSON.stringify({ success: false, error: 'student_id and relationship_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RESEND-STUDENT-INVITATION] Processing resend for student:', student_id);

    // Verify teacher-student relationship
    const { data: relationship, error: relError } = await supabase
      .from('teacher_student_relationships')
      .select('*')
      .eq('id', relationship_id)
      .eq('teacher_id', user.id)
      .eq('student_id', student_id)
      .single();

    if (relError || !relationship) {
      console.error('[RESEND-STUDENT-INVITATION] Invalid relationship:', relError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid teacher-student relationship' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get student profile
    const { data: studentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('id', student_id)
      .single();

    if (profileError || !studentProfile) {
      console.error('[RESEND-STUDENT-INVITATION] Student not found:', profileError);
      return new Response(
        JSON.stringify({ success: false, error: 'Student not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if student email is confirmed
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(student_id);

    if (authUser?.user?.email_confirmed_at) {
      console.log('[RESEND-STUDENT-INVITATION] Email already confirmed');
      return new Response(
        JSON.stringify({ success: false, error: 'Student email already confirmed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get teacher profile for personalized email
    const { data: teacherProfile } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();

    // Generate new magic link for activation
    const redirectUrl = Deno.env.get('SITE_URL') || 'https://www.tutor-flow.app';
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: studentProfile.email,
      options: {
        redirectTo: `${redirectUrl}/auth/callback`
      }
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[RESEND-STUDENT-INVITATION] Error generating magic link:', linkError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to generate invitation link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send custom invitation email via AWS SES
    const { data: emailResult, error: emailError } = await supabaseAdmin.functions.invoke(
      'send-student-invitation',
      {
        body: {
          email: studentProfile.email,
          name: studentProfile.name,
          teacher_name: teacherProfile?.name || 'seu professor',
          invitation_link: linkData.properties.action_link,
        }
      }
    );

    if (emailError || (emailResult && !emailResult.success)) {
      console.error('[RESEND-STUDENT-INVITATION] Error sending email:', emailError || emailResult?.error);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send invitation email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RESEND-STUDENT-INVITATION] Invitation sent successfully via AWS SES');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Invitation sent successfully' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[RESEND-STUDENT-INVITATION] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

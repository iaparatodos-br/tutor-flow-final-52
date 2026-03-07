import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[CHECK-EMAIL-CONFIRMATION] Function started');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[CHECK-EMAIL-CONFIRMATION] No authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', code: 'INVALID_SESSION', confirmationStatus: {} }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use user-scoped client for JWT validation
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } }
      }
    );

    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser) {
      console.error('[CHECK-EMAIL-CONFIRMATION] JWT validation failed:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', code: 'INVALID_SESSION', confirmationStatus: {} }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = authUser.id;
    console.log('[CHECK-EMAIL-CONFIRMATION] Authenticated teacher:', userId);

    const { student_ids } = await req.json();

    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      console.error('[CHECK-EMAIL-CONFIRMATION] Missing or invalid student_ids');
      return new Response(
        JSON.stringify({ success: false, error: 'student_ids array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[CHECK-EMAIL-CONFIRMATION] Checking confirmation status for students:', student_ids);

    // Use SERVICE_ROLE client for data operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify teacher-student relationships
    const { data: relationships, error: relError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select('student_id')
      .eq('teacher_id', userId)
      .in('student_id', student_ids);

    if (relError) {
      console.error('[CHECK-EMAIL-CONFIRMATION] Error fetching relationships:', relError);
      return new Response(
        JSON.stringify({ success: false, error: 'Error verifying relationships' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validStudentIds = new Set(relationships?.map(r => r.student_id) || []);
    const authorizedStudentIds = student_ids.filter(id => validStudentIds.has(id));

    if (authorizedStudentIds.length === 0) {
      console.error('[CHECK-EMAIL-CONFIRMATION] No valid students found');
      return new Response(
        JSON.stringify({ success: false, error: 'No valid students found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check confirmation status for each student
    const confirmationStatus: Record<string, boolean> = {};

    for (const studentId of authorizedStudentIds) {
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(studentId);
        confirmationStatus[studentId] = !!authUser?.user?.email_confirmed_at;
      } catch (error) {
        console.error(`[CHECK-EMAIL-CONFIRMATION] Error checking student ${studentId}:`, error);
        confirmationStatus[studentId] = false;
      }
    }

    console.log('[CHECK-EMAIL-CONFIRMATION] Confirmation status:', confirmationStatus);

    return new Response(
      JSON.stringify({ success: true, confirmationStatus }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[CHECK-EMAIL-CONFIRMATION] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

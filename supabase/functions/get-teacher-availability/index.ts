import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Deploy timestamp: 2025-10-14T02:35:00Z - Force redeploy to fix SQL order syntax cache issue

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    console.log('🔍 [get-teacher-availability] Function started');
    
    const authHeader = req.headers.get("Authorization");
    console.log('🔍 Auth header present:', !!authHeader);
    if (!authHeader) throw new Error("No authorization header provided");

    // Auth client with ANON_KEY + user's auth header for proper session validation
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    console.log('🔍 User data:', { userId: userData?.user?.id, error: userError?.message });
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;

    // Service role client for data queries (bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body = await req.json();
    console.log('🔍 Request body:', body);
    const { teacherId } = body;
    if (!teacherId) throw new Error("teacherId is required");

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    console.log('🔍 Profile check:', { profile, profileError });
    if (profileError) throw profileError;
    if (!profile) throw new Error("Profile not found");
    if (profile.role !== 'aluno') throw new Error("Only students can access teacher availability");

    // Verify that this student is linked to the requested teacher
    console.log('🔍 Checking relationship for teacherId:', teacherId, 'studentId:', user.id);
    const { data: relationship, error: relationshipError } = await supabase
      .from('teacher_student_relationships')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('student_id', user.id)
      .maybeSingle();

    console.log('🔍 Relationship check:', { relationship, relationshipError });
    if (relationshipError) throw relationshipError;
    if (!relationship) throw new Error("Student is not assigned to this teacher");

    const nowIso = new Date().toISOString();

    const [workingHoursRes, blocksRes, classesRes, servicesRes] = await Promise.all([
      supabase
        .from('working_hours')
        .select('id, day_of_week, start_time, end_time')
        .eq('teacher_id', teacherId)
        .eq('is_active', true),
      supabase
        .from('availability_blocks')
        .select('id, start_datetime, end_datetime, title')
        .eq('teacher_id', teacherId)
        .gte('end_datetime', nowIso)
        .order('start_datetime', { ascending: true }),
      // Sequential approach: first get classes, then participants (Etapa 0.6)
      supabase
        .from('classes')
        .select('id, class_date, duration_minutes, teacher_id')
        .eq('teacher_id', teacherId)
        .gte('class_date', nowIso)
        .order('class_date', { ascending: true }),
      supabase
        .from('class_services')
        .select('id, name, price, duration_minutes, is_default')
        .eq('teacher_id', teacherId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
    ]);

    const whErr = (workingHoursRes as any).error; if (whErr) throw whErr;
    const blErr = (blocksRes as any).error; if (blErr) throw blErr;
    const clErr = (classesRes as any).error; if (clErr) throw clErr;
    const svErr = (servicesRes as any).error; if (svErr) throw svErr;

    return new Response(
      JSON.stringify({
        workingHours: (workingHoursRes as any).data ?? [],
        availabilityBlocks: (blocksRes as any).data ?? [],
        existingClasses: ((classesRes as any).data ?? []).map((c: any) => ({ 
          class_date: c.class_date, 
          duration_minutes: c.duration_minutes 
        })),
        services: (servicesRes as any).data ?? []
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ [get-teacher-availability] Error:', message);
    console.error('❌ Full error:', error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
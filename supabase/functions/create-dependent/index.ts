import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateDependentRequest {
  responsible_id: string;
  name: string;
  birth_date?: string;
  notes?: string;
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

    const teacherId = user.id;
    console.log(`Teacher ${teacherId} creating dependent`);

    // Verify teacher role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', teacherId)
      .maybeSingle();

    if (profileError || !profile || profile.role !== 'professor') {
      console.error('User is not a professor:', profileError);
      return new Response(
        JSON.stringify({ error: 'Only professors can create dependents' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: CreateDependentRequest = await req.json();
    console.log('Request body:', JSON.stringify(body));

    // Validate required fields
    if (!body.responsible_id || !body.name?.trim()) {
      return new Response(
        JSON.stringify({ error: 'responsible_id and name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify responsible is a student of this teacher
    const { data: relationship, error: relError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('student_id', body.responsible_id)
      .maybeSingle();

    if (relError || !relationship) {
      console.error('Responsible is not a student of this teacher:', relError);
      return new Response(
        JSON.stringify({ error: 'Responsible must be an existing student of yours' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check plan limits using count_teacher_students_and_dependents
    const { data: counts, error: countError } = await supabaseAdmin
      .rpc('count_teacher_students_and_dependents', { p_teacher_id: teacherId });

    if (countError) {
      console.error('Error counting students:', countError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify plan limits' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // #134 — Get teacher's plan limit and slug (sequential queries to avoid FK join)
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', teacherId)
      .eq('status', 'active')
      .maybeSingle();

    let studentLimit = 3; // Default free plan limit
    let planSlug = 'free';
    
    if (subscription?.plan_id) {
      const { data: plan } = await supabaseAdmin
        .from('subscription_plans')
        .select('student_limit, slug')
        .eq('id', subscription.plan_id)
        .maybeSingle();
      if (plan) {
        studentLimit = plan.student_limit || 3;
        planSlug = plan.slug || 'free';
      }
    }

    const currentTotal = counts?.[0]?.total_students || 0;
    const futureTotal = currentTotal + 1;
    console.log(`Current total: ${currentTotal}, Future total: ${futureTotal}, Limit: ${studentLimit}, Plan: ${planSlug}`);

    // Check if adding this dependent exceeds the limit
    if (futureTotal > studentLimit) {
      if (planSlug === 'free' || !subscription) {
        // FREE PLAN: Block dependent creation completely
        console.log('[PLAN LIMIT] Free plan limit reached, blocking dependent creation');
        return new Response(
          JSON.stringify({ 
            error: 'Plan limit reached',
            message: `Limite de ${studentLimit} alunos/dependentes atingido no plano gratuito. Faça upgrade para adicionar mais.`,
            plan_limit_reached: true,
            current: currentTotal,
            limit: studentLimit
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // PAID PLANS: For now, still block - overage for dependents should be handled separately
      // TODO: Implement overage billing for dependents similar to students
      console.log('[PLAN LIMIT] Paid plan limit reached for dependent');
      return new Response(
        JSON.stringify({ 
          error: 'Plan limit reached',
          message: `Você atingiu o limite de ${studentLimit} alunos/dependentes do seu plano.`,
          current: currentTotal,
          limit: studentLimit
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the dependent
    const { data: dependent, error: createError } = await supabaseAdmin
      .from('dependents')
      .insert({
        responsible_id: body.responsible_id,
        teacher_id: teacherId,
        name: body.name.trim(),
        birth_date: body.birth_date || null,
        notes: body.notes?.trim() || null
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating dependent:', createError);
      return new Response(
        JSON.stringify({ error: 'Failed to create dependent', details: createError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Dependent created successfully: ${dependent.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        dependent,
        counts: {
          total: currentTotal + 1,
          limit: studentLimit
        }
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

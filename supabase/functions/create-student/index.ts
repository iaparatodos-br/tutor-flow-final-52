import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY") || "");

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

interface CreateStudentRequest {
  name: string;
  email: string;
  teacher_id: string;
  redirect_url?: string;
  guardian_name?: string | null;
  guardian_email?: string | null;
  guardian_phone?: string | null;
  guardian_cpf?: string | null;
  guardian_address_street?: string | null;
  guardian_address_city?: string | null;
  guardian_address_state?: string | null;
  guardian_address_postal_code?: string | null;
  billing_day?: number | null;
  stripe_customer_id?: string | null;
  notify_professor_email?: string | null;
  professor_name?: string | null;
  business_profile_id?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: CreateStudentRequest = await req.json();
    console.log('create-student function called with body:', JSON.stringify(body));

    if (!body?.email || !body?.name || !body?.teacher_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Campos obrigatórios não informados: nome, email e professor" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Force production URL for email verification links, ignoring localhost URLs
    const siteUrlFromEnv = Deno.env.get("SITE_URL");
    const productionUrl = siteUrlFromEnv || "https://www.tutor-flow.app";
    const redirectTo = body.redirect_url && !body.redirect_url.includes('localhost') 
      ? body.redirect_url 
      : `${productionUrl}/auth/callback`;

    console.log('SITE_URL environment variable:', siteUrlFromEnv);
    console.log('Production URL being used:', productionUrl);
    console.log('Final redirectTo URL:', redirectTo);
    console.log('Attempting to invite user:', body.email);

    // Check if email is already used by a professor
    const { data: professorWithEmail, error: professorLookupError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('email', body.email)
      .eq('role', 'professor')
      .maybeSingle();

    if (professorLookupError) {
      console.error('Error looking up professor:', professorLookupError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao verificar e-mail' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (professorWithEmail) {
      console.log('Email already used by a professor:', body.email);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Este e-mail já está sendo usado por um professor. Use outro e-mail para cadastrar o aluno.'
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if a user with this email already exists as a student
    const { data: existingUser, error: lookupError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('email', body.email)
      .eq('role', 'aluno')
      .maybeSingle();

    if (lookupError) {
      console.error('Error looking up existing user:', lookupError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao verificar usuário existente' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let studentId: string;
    let isNewStudent = false;

    if (existingUser) {
      // Student already exists, just create the relationship
      console.log('Student already exists, creating relationship');
      studentId = existingUser.id;

      // Check if relationship already exists
      const { data: existingRelationship } = await supabaseAdmin
        .from('teacher_student_relationships')
        .select('id')
        .eq('teacher_id', body.teacher_id)
        .eq('student_id', studentId)
        .maybeSingle();

      if (existingRelationship) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Este aluno já está vinculado à sua conta'
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    } else {
      // New student, create the account first
      console.log('Creating new student account');
      isNewStudent = true;

      // Invite the student by email (Supabase sends the invite email)
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        body.email,
        {
          redirectTo,
          data: {
            name: body.name,
            role: 'aluno',
          },
        }
      );

      if (inviteError || !inviteData?.user) {
        console.error('Error inviting student:', inviteError);
        console.log('InviteError details:', JSON.stringify(inviteError));
        
        // Check for specific error types and return success response with error field
        let errorMessage = 'Failed to invite student';
        
        if (inviteError?.message) {
          // Handle email already exists error
          if (inviteError.message.includes('User already registered') || 
              inviteError.message.includes('already exists') ||
              inviteError.message.includes('email address is already registered')) {
            errorMessage = 'Este e-mail já está sendo utilizado por outro aluno ou professor';
          } else {
            errorMessage = inviteError.message;
          }
        }
        
        // Return 200 with error in response body instead of error status
        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      studentId = inviteData.user.id;

      // Wait for trigger to create profile, then update additional fields
      let retries = 10;
      let profileFound = false;
      while (retries-- > 0 && !profileFound) {
        const { data: profileRow } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('id', studentId)
          .maybeSingle();

        if (profileRow?.id) {
          profileFound = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }

      // Guardian data is now stored ONLY in teacher_student_relationships table
      // No longer updating profiles table for guardian information
    }

    // Create the teacher-student relationship with teacher-specific data FIRST
    const { error: relationshipError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .insert({
        teacher_id: body.teacher_id,
        student_id: studentId,
        billing_day: body.billing_day ?? 15,
        stripe_customer_id: body.stripe_customer_id ?? null,
        student_name: body.name,
        student_guardian_name: body.guardian_name ?? null,
        student_guardian_email: body.guardian_email ?? null,
        student_guardian_phone: body.guardian_phone ?? null,
        student_guardian_cpf: body.guardian_cpf ?? null,
        student_guardian_address_street: body.guardian_address_street ?? null,
        student_guardian_address_city: body.guardian_address_city ?? null,
        student_guardian_address_state: body.guardian_address_state ?? null,
        student_guardian_address_postal_code: body.guardian_address_postal_code ?? null,
        business_profile_id: body.business_profile_id ?? null,
      });

    if (relationshipError) {
      console.error('Error creating teacher-student relationship:', relationshipError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao criar vínculo professor-aluno' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log('Teacher-student relationship created successfully');

    // NOW check if teacher needs to be charged for overage AFTER creating relationship
    let billingResult = null;
    let billingWarning = null;
    
    // Get UPDATED student count for this teacher (now includes the new student)
    const { count: currentStudentCount } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', body.teacher_id);

    // Get teacher's subscription and plan
    const { data: subscription } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id, status')
      .eq('user_id', body.teacher_id)
      .eq('status', 'active')
      .maybeSingle();

    if (subscription?.plan_id) {
      const { data: plan } = await supabaseAdmin
        .from('subscription_plans')
        .select('student_limit, slug')
        .eq('id', subscription.plan_id)
        .single();

      // Check if adding this student exceeds the limit (only for paid plans)
      if (plan && plan.slug !== 'free' && (currentStudentCount ?? 0) > plan.student_limit) {
        const extraStudents = (currentStudentCount ?? 0) - plan.student_limit;
        console.log('[BILLING] Student count exceeds limit, triggering overage billing', { 
          currentCount: currentStudentCount, 
          limit: plan.student_limit, 
          extraStudents,
          teacherId: body.teacher_id,
          studentEmail: body.email
        });

        try {
          const { data: billingData, error: billingError } = await supabaseAdmin.functions.invoke(
            'handle-student-overage',
            {
              body: {
                extraStudents,
                planLimit: plan.student_limit,
              }
            }
          );

          if (billingError) {
            console.error('[BILLING ERROR]', {
              teacherId: body.teacher_id,
              studentEmail: body.email,
              extraStudents,
              error: billingError
            });
            
            billingWarning = `Aluno adicionado, mas houve falha na cobrança adicional de R$ ${(extraStudents * 5).toFixed(2)}. O valor será incluído na próxima fatura.`;
          } else {
            billingResult = billingData;
            console.log('[BILLING SUCCESS]', { teacherId: body.teacher_id, billingData });
          }
        } catch (err) {
          console.error('[BILLING EXCEPTION]', {
            teacherId: body.teacher_id,
            studentEmail: body.email,
            extraStudents,
            error: (err as Error).message
          });
          
          billingWarning = `Aluno adicionado com sucesso, mas não foi possível processar a cobrança adicional. Entre em contato com o suporte.`;
        }
      }
    }

    // Send a confirmation email to the professor if provided
    if (body.notify_professor_email) {
      try {
        await resend.emails.send({
          from: `${body.professor_name || 'TutorFlow'} <noreply@resend.dev>`,
          to: [body.notify_professor_email],
          subject: isNewStudent ? `Aluno cadastrado: ${body.name}` : `Aluno vinculado: ${body.name}`,
          html: `
            <div style="font-family:Arial, sans-serif; max-width:600px; margin:0 auto;">
              <h2 style="color:#333;">${isNewStudent ? 'Novo aluno cadastrado' : 'Aluno vinculado à sua conta'}</h2>
              <p>O aluno <strong>${body.name}</strong> (${body.email}) foi ${isNewStudent ? 'convidado e receberá um e-mail para concluir o cadastro' : 'vinculado à sua conta'}.</p>
              <p style="color:#666; font-size:12px;">Este é um e-mail automático do sistema.</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.warn('Failed sending confirmation email to professor:', emailErr);
        // Do not fail the request because of email issues
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: studentId, 
        is_new_student: isNewStudent,
        message: isNewStudent ? 'Aluno criado com sucesso!' : 'Aluno vinculado com sucesso!',
        billing: billingResult,
        billing_warning: billingWarning
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('Error in create-student function:', error);
    
    // Check for specific error types and provide user-friendly messages
    let errorMessage = 'Erro inesperado ao cadastrar aluno';
    
    if (error.message) {
      if (error.message.includes('User already registered') || 
          error.message.includes('already exists') ||
          error.message.includes('email address is already registered')) {
        errorMessage = 'Este e-mail já está sendo utilizado por outro aluno ou professor';
      } else {
        errorMessage = error.message;
      }
    }
    
    // Return 200 with error in response body instead of error status
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
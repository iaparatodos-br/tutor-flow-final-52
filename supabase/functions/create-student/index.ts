import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";
import { Resend } from "npm:resend@4.0.0";

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
  billing_day?: number | null;
  stripe_customer_id?: string | null;
  notify_professor_email?: string | null;
  professor_name?: string | null;
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
    const productionUrl = siteUrlFromEnv || "https://nwgomximjevgczwuyqcx.supabase.co";
    const redirectTo = body.redirect_url && !body.redirect_url.includes('localhost') 
      ? body.redirect_url 
      : `${productionUrl}/auth/callback`;

    console.log('SITE_URL environment variable:', siteUrlFromEnv);
    console.log('Production URL being used:', productionUrl);
    console.log('Final redirectTo URL:', redirectTo);
    console.log('Attempting to invite user:', body.email);

    // Check if a user with this email already exists
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

      if (profileFound) {
        await supabaseAdmin
          .from('profiles')
          .update({
            guardian_name: body.guardian_name ?? null,
            guardian_email: body.guardian_email ?? null,
            guardian_phone: body.guardian_phone ?? null,
          })
          .eq('id', studentId);
      }
    }

    // Create the teacher-student relationship
    const { error: relationshipError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .insert({
        teacher_id: body.teacher_id,
        student_id: studentId,
        billing_day: body.billing_day ?? 15,
        stripe_customer_id: body.stripe_customer_id ?? null,
      });

    if (relationshipError) {
      console.error('Error creating teacher-student relationship:', relationshipError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao criar vínculo professor-aluno' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log('Teacher-student relationship created successfully');

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
        message: isNewStudent ? 'Aluno criado com sucesso!' : 'Aluno vinculado com sucesso!'
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
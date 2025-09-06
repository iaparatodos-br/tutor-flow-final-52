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
  notify_professor_email?: string | null;
  professor_name?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: CreateStudentRequest = await req.json();

    if (!body?.email || !body?.name || !body?.teacher_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: name, email, teacher_id" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const redirectTo = body.redirect_url || `${Deno.env.get("SUPABASE_URL")}/auth/v1/verify`;

    // Invite the student by email (Supabase sends the invite email)
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      body.email,
      {
        redirectTo,
        data: {
          name: body.name,
          role: 'aluno',
          teacher_id: body.teacher_id,
        },
      }
    );

    if (inviteError || !inviteData?.user) {
      console.error('Error inviting student:', inviteError);
      
      // Check for specific error types
      let errorMessage = 'Failed to invite student';
      let statusCode = 500;
      
      if (inviteError?.message) {
        // Handle email already exists error
        if (inviteError.message.includes('User already registered') || 
            inviteError.message.includes('already exists') ||
            inviteError.message.includes('email address is already registered')) {
          errorMessage = 'Este e-mail já está sendo utilizado por outro aluno ou professor';
          statusCode = 400;
        } else {
          errorMessage = inviteError.message;
        }
      }
      
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: statusCode, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const newUserId = inviteData.user.id;

    // Wait for trigger to create profile, then update additional fields
    let retries = 10;
    let profileFound = false;
    while (retries-- > 0 && !profileFound) {
      const { data: profileRow } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', newUserId)
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
          teacher_id: body.teacher_id,
          guardian_name: body.guardian_name ?? null,
          guardian_email: body.guardian_email ?? null,
          guardian_phone: body.guardian_phone ?? null,
          billing_day: body.billing_day ?? null,
        })
        .eq('id', newUserId);
    }

    // Send a confirmation email to the professor if provided
    if (body.notify_professor_email) {
      try {
        await resend.emails.send({
          from: `${body.professor_name || 'TutorFlow'} <noreply@resend.dev>`,
          to: [body.notify_professor_email],
          subject: `Aluno cadastrado: ${body.name}`,
          html: `
            <div style="font-family:Arial, sans-serif; max-width:600px; margin:0 auto;">
              <h2 style="color:#333;">Novo aluno cadastrado</h2>
              <p>O aluno <strong>${body.name}</strong> (${body.email}) foi convidado e receberá um e-mail para concluir o cadastro.</p>
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
      JSON.stringify({ success: true, user_id: newUserId }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('Error in create-student function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unexpected error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
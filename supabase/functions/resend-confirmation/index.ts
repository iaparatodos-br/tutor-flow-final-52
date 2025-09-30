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
    console.log('[RESEND-CONFIRMATION] Function started');

    // Parse request body
    const { email } = await req.json();

    if (!email) {
      console.error('[RESEND-CONFIRMATION] Missing email');
      return new Response(
        JSON.stringify({ success: false, error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RESEND-CONFIRMATION] Processing resend for:', email);

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

    // Check if user exists
    const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      console.error('[RESEND-CONFIRMATION] Error listing users:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = users.users.find(u => u.email === email);

    if (!user) {
      console.error('[RESEND-CONFIRMATION] User not found');
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email is already confirmed
    if (user.email_confirmed_at) {
      console.log('[RESEND-CONFIRMATION] Email already confirmed');
      return new Response(
        JSON.stringify({ success: false, error: 'Email already confirmed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate new email confirmation
    const redirectUrl = Deno.env.get('SITE_URL') || 'https://www.tutor-flow.app';
    const { error: resendError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: `${redirectUrl}/auth/callback`
      }
    });

    if (resendError) {
      console.error('[RESEND-CONFIRMATION] Error generating confirmation link:', resendError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to generate confirmation link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RESEND-CONFIRMATION] Confirmation email sent successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Confirmation email sent successfully' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[RESEND-CONFIRMATION] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

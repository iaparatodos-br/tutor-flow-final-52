import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteDependentRequest {
  dependent_id: string;
  force?: boolean; // If true, delete even with pending classes (will remove participations)
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

    const userId = user.id;
    console.log(`User ${userId} deleting dependent`);

    // Parse request body
    const body: DeleteDependentRequest = await req.json();
    console.log('Request body:', JSON.stringify(body));

    // Validate required fields
    if (!body.dependent_id) {
      return new Response(
        JSON.stringify({ error: 'dependent_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the dependent exists and user has permission
    const { data: dependent, error: depError } = await supabaseAdmin
      .from('dependents')
      .select('id, teacher_id, responsible_id, name')
      .eq('id', body.dependent_id)
      .maybeSingle();

    if (depError || !dependent) {
      console.error('Dependent not found:', depError);
      return new Response(
        JSON.stringify({ error: 'Dependent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check permission: must be the teacher who owns this dependent
    if (dependent.teacher_id !== userId) {
      console.error(`User ${userId} does not own dependent ${body.dependent_id}`);
      return new Response(
        JSON.stringify({ error: 'You do not have permission to delete this dependent' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for pending/future classes
    // #135 — Sequential queries to avoid FK join (classes!inner)
    const { data: pendingParticipants, error: classError } = await supabaseAdmin
      .from('class_participants')
      .select('id, class_id, status')
      .eq('dependent_id', body.dependent_id)
      .in('status', ['pendente', 'confirmada']);

    if (classError) {
      console.error('Error checking pending classes:', classError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify pending classes' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch class dates separately
    const now = new Date();
    let futureClasses: any[] = [];
    if (pendingParticipants && pendingParticipants.length > 0) {
      const classIds = [...new Set(pendingParticipants.map(p => p.class_id))];
      const { data: classRows } = await supabaseAdmin
        .from('classes')
        .select('id, class_date, status')
        .in('id', classIds);

      const classMap = new Map((classRows || []).map(c => [c.id, c]));
      futureClasses = pendingParticipants.filter(p => {
        const cls = classMap.get(p.class_id);
        return cls && new Date(cls.class_date) > now;
      });
    }

    if (futureClasses.length > 0 && !body.force) {
      console.log(`Dependent has ${futureClasses.length} pending future classes`);
      return new Response(
        JSON.stringify({ 
          error: 'Dependent has pending classes',
          message: `This dependent has ${futureClasses.length} pending/confirmed future class(es). Cancel them first or use force=true to delete anyway.`,
          pending_classes: futureClasses.length,
          requires_force: true
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If force=true and there are pending classes, update participations to 'removida'
    if (futureClasses.length > 0 && body.force) {
      console.log(`Force deleting: marking ${futureClasses.length} participations as 'removida'`);
      
      const { error: updateError } = await supabaseAdmin
        .from('class_participants')
        .update({ 
          status: 'removida',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'Dependente removido do sistema'
        })
        .eq('dependent_id', body.dependent_id)
        .in('status', ['pendente', 'confirmada']);

      if (updateError) {
        console.error('Error updating participations:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update class participations' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check for unbilled completed classes
    // #135 — Sequential query for unbilled classes (avoid FK join)
    const { data: unbilledParticipants, error: unbilledError } = await supabaseAdmin
      .from('class_participants')
      .select('id, class_id')
      .eq('dependent_id', body.dependent_id)
      .eq('status', 'concluida')
      .is('charge_applied', false);

    if (unbilledError) {
      console.error('Error checking unbilled classes:', unbilledError);
    }
    const unbilledClasses = unbilledParticipants;

    const unbilledCount = unbilledClasses?.length || 0;
    if (unbilledCount > 0) {
      console.warn(`Warning: Dependent has ${unbilledCount} unbilled completed classes`);
    }

    // Delete material access for this dependent
    const { error: materialError } = await supabaseAdmin
      .from('material_access')
      .delete()
      .eq('dependent_id', body.dependent_id);

    if (materialError) {
      console.error('Error deleting material access:', materialError);
      // Continue anyway, not critical
    }

    // Delete class report feedbacks for this dependent
    const { error: feedbackError } = await supabaseAdmin
      .from('class_report_feedbacks')
      .delete()
      .eq('dependent_id', body.dependent_id);

    if (feedbackError) {
      console.error('Error deleting report feedbacks:', feedbackError);
      // Continue anyway, not critical
    }

    // CRITICAL: Delete invoice_classes BEFORE class_participants (FK RESTRICT on participant_id)
    const { data: depParticipants } = await supabaseAdmin
      .from('class_participants')
      .select('id')
      .eq('dependent_id', body.dependent_id);
    
    const depParticipantIds = (depParticipants || []).map((p: any) => p.id);
    if (depParticipantIds.length > 0) {
      const { error: invoiceClassesError } = await supabaseAdmin
        .from('invoice_classes')
        .delete()
        .in('participant_id', depParticipantIds);
      
      if (invoiceClassesError) {
        console.error('Error deleting invoice_classes for dependent:', invoiceClassesError);
      }
    }

    // Now safe to delete class_participants for this dependent
    const { error: participantsDeleteError } = await supabaseAdmin
      .from('class_participants')
      .delete()
      .eq('dependent_id', body.dependent_id);
    
    if (participantsDeleteError) {
      console.error('Error deleting class_participants:', participantsDeleteError);
    }

    // Delete the dependent
    const { error: deleteError } = await supabaseAdmin
      .from('dependents')
      .delete()
      .eq('id', body.dependent_id);

    if (deleteError) {
      console.error('Error deleting dependent:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete dependent', details: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Dependent ${body.dependent_id} deleted successfully`);

    return new Response(
      JSON.stringify({ 
        success: true,
        deleted_dependent: {
          id: body.dependent_id,
          name: dependent.name
        },
        warnings: unbilledCount > 0 ? {
          unbilled_classes: unbilledCount,
          message: `${unbilledCount} completed class(es) were not billed before deletion`
        } : undefined,
        force_applied: body.force && futureClasses.length > 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

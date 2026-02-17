import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EndRecurrenceRequest {
  templateId: string;
  endDate: string; // ISO date string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Autenticar usuário
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Unauthorized');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { templateId, endDate }: EndRecurrenceRequest = await req.json();

    console.log(`[end-recurrence] User: ${user.id}, Template: ${templateId}, End: ${endDate}`);

    // 1. Verificar se o usuário é dono da template
    const { data: template, error: templateError } = await supabase
      .from('classes')
      .select('*')
      .eq('id', templateId)
      .eq('teacher_id', user.id)
      .eq('is_template', true)
      .single();

    if (templateError || !template) {
      throw new Error('Template not found or unauthorized');
    }

    // 2. Atualizar template com data de término
    const { error: updateError } = await supabase
      .from('classes')
      .update({ recurrence_end_date: endDate })
      .eq('id', templateId);

    if (updateError) {
      throw new Error(`Failed to update template: ${updateError.message}`);
    }

    // 3. Identify future classes to delete
    const { data: futuresToDelete, error: fetchFuturesError } = await supabase
      .from('classes')
      .select('id')
      .eq('class_template_id', templateId)
      .gte('class_date', endDate)
      .neq('status', 'concluida');

    if (fetchFuturesError) {
      console.error('[end-recurrence] Error fetching future classes:', fetchFuturesError);
      throw new Error(`Failed to fetch future classes: ${fetchFuturesError.message}`);
    }

    const futureClassIds = (futuresToDelete || []).map(c => c.id);
    let deletedCount = futureClassIds.length;

    if (futureClassIds.length > 0) {
      // 3a. Get participant IDs to clean invoice_classes first (FK RESTRICT)
      const { data: futureParticipants } = await supabase
        .from('class_participants')
        .select('id')
        .in('class_id', futureClassIds);
      
      const futureParticipantIds = (futureParticipants || []).map(p => p.id);

      // 3b. Delete invoice_classes referencing these participants
      if (futureParticipantIds.length > 0) {
        await supabase.from('invoice_classes').delete().in('participant_id', futureParticipantIds);
      }

      // 3c. Delete class_exceptions for these classes
      await supabase.from('class_exceptions').delete().in('original_class_id', futureClassIds);

      // 3d. Delete class_notifications for these classes
      await supabase.from('class_notifications').delete().in('class_id', futureClassIds);

      // 3e. Delete class_participants
      await supabase.from('class_participants').delete().in('class_id', futureClassIds);

      // 3f. Now safe to delete the classes
      const { error: deleteError } = await supabase
        .from('classes')
        .delete()
        .in('id', futureClassIds);

      if (deleteError) {
        console.error('[end-recurrence] Error deleting future classes:', deleteError);
        throw new Error(`Failed to delete future classes: ${deleteError.message}`);
      }
    }

    const deletedClasses = futuresToDelete;

    console.log(`[end-recurrence] Deleted ${deletedClasses?.length || 0} future classes`);

    // 4. NEW: Notify participants (including responsibles for dependents) about recurrence ending
    const { data: participants } = await supabase
      .from('class_participants')
      .select('student_id, dependent_id')
      .eq('class_id', templateId);

    if (participants && participants.length > 0) {
      // Collect unique responsible parties to notify
      const notifyUserIds = new Set<string>();
      
      for (const p of participants) {
        if (p.dependent_id) {
          // Get the responsible for this dependent
          const { data: dependent } = await supabase
            .from('dependents')
            .select('responsible_id, name')
            .eq('id', p.dependent_id)
            .maybeSingle();
          
          if (dependent?.responsible_id) {
            notifyUserIds.add(dependent.responsible_id);
            console.log(`[end-recurrence] Will notify responsible ${dependent.responsible_id} for dependent ${dependent.name}`);
          }
        } else {
          notifyUserIds.add(p.student_id);
        }
      }

      console.log(`[end-recurrence] ${notifyUserIds.size} unique users to notify about recurrence end`);
      // Note: Actual notification sending can be added here if needed
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Recurrence ended successfully',
        deletedCount: deletedClasses?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[end-recurrence] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface EndRecurrenceRequest {
  templateId: string;
  endDate: string; // YYYY-MM-DD date string
}

/**
 * Converts a local date string (YYYY-MM-DD) to the UTC instant representing
 * midnight (00:00) in the given timezone.
 * E.g., "2026-03-15" in "America/Sao_Paulo" (UTC-3) → 2026-03-15T03:00:00.000Z
 */
function localDateToUtcMidnight(dateStr: string, timezone: string): string {
  // Normalize: accept both "YYYY-MM-DD" and full ISO timestamps
  const normalizedDateStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  // Parse date parts
  const [year, month, day] = normalizedDateStr.split('-').map(Number);
  
  // Create a formatter that outputs the UTC offset for this timezone at this date
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  });
  
  // We need to find what UTC offset applies for the given timezone on the given date
  // Create a rough UTC date for the target date
  const roughDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // noon UTC to avoid edge cases
  const parts = formatter.formatToParts(roughDate);
  const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || '+00:00';
  
  // Parse offset like "GMT-03:00" or "GMT+05:30"
  const offsetMatch = tzPart.match(/GMT([+-])(\d{2}):(\d{2})/);
  let offsetMinutes = 0;
  if (offsetMatch) {
    const sign = offsetMatch[1] === '+' ? 1 : -1;
    offsetMinutes = sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3]));
  }
  
  // Midnight local = midnight UTC minus the offset
  // If timezone is UTC-3, midnight local = 03:00 UTC
  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60 * 1000;
  return new Date(utcMs).toISOString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Autenticar usuário via user-scoped client
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Unauthorized');
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } }
      }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

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

    // 2. Buscar timezone do professor
    const { data: teacherProfile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle();

    const teacherTimezone = teacherProfile?.timezone || 'America/Sao_Paulo';
    console.log(`[end-recurrence] Teacher timezone: ${teacherTimezone}`);

    // 3. Atualizar template com data de término
    // Normalize endDate to YYYY-MM-DD for storage
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    const { error: updateError } = await supabase
      .from('classes')
      .update({ recurrence_end_date: normalizedEndDate })
      .eq('id', templateId);

    if (updateError) {
      throw new Error(`Failed to update template: ${updateError.message}`);
    }

    // 4. Converter endDate (YYYY-MM-DD) para instante UTC de meia-noite no fuso do professor
    const endDateUtc = localDateToUtcMidnight(endDate, teacherTimezone);
    console.log(`[end-recurrence] endDate ${endDate} → UTC midnight: ${endDateUtc}`);

    // 5. Identify future classes to delete (usando instante UTC correto)
    const { data: futuresToDelete, error: fetchFuturesError } = await supabase
      .from('classes')
      .select('id')
      .eq('class_template_id', templateId)
      .gte('class_date', endDateUtc)
      .neq('status', 'concluida');

    if (fetchFuturesError) {
      console.error('[end-recurrence] Error fetching future classes:', fetchFuturesError);
      throw new Error(`Failed to fetch future classes: ${fetchFuturesError.message}`);
    }

    const futureClassIds = (futuresToDelete || []).map(c => c.id);
    let deletedCount = futureClassIds.length;

    if (futureClassIds.length > 0) {
      // 5a. Get participant IDs to clean invoice_classes first (FK RESTRICT)
      const { data: futureParticipants } = await supabase
        .from('class_participants')
        .select('id')
        .in('class_id', futureClassIds);
      
      const futureParticipantIds = (futureParticipants || []).map(p => p.id);

      // 5b. Delete invoice_classes referencing these participants
      if (futureParticipantIds.length > 0) {
        await supabase.from('invoice_classes').delete().in('participant_id', futureParticipantIds);
      }

      // 5c. Delete class_notifications for these classes
      await supabase.from('class_notifications').delete().in('class_id', futureClassIds);

      // 5e. Delete class_participants
      await supabase.from('class_participants').delete().in('class_id', futureClassIds);

      // 5f. Now safe to delete the classes
      const { error: deleteError } = await supabase
        .from('classes')
        .delete()
        .in('id', futureClassIds);

      if (deleteError) {
        console.error('[end-recurrence] Error deleting future classes:', deleteError);
        throw new Error(`Failed to delete future classes: ${deleteError.message}`);
      }
    }

    console.log(`[end-recurrence] Deleted ${deletedCount} future classes`);

    // 6. Notify participants about recurrence ending
    const { data: participants } = await supabase
      .from('class_participants')
      .select('student_id, dependent_id')
      .eq('class_id', templateId);

    if (participants && participants.length > 0) {
      const notifyUserIds = new Set<string>();
      
      for (const p of participants) {
        if (p.dependent_id) {
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
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Recurrence ended successfully',
        deletedCount,
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

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

    // 3. Deletar aulas materializadas futuras não concluídas
    const { data: deletedClasses, error: deleteError } = await supabase
      .from('classes')
      .delete()
      .eq('class_template_id', templateId)
      .gte('class_date', endDate)
      .neq('status', 'concluida')
      .select();

    if (deleteError) {
      console.error('[end-recurrence] Error deleting future classes:', deleteError);
      throw new Error(`Failed to delete future classes: ${deleteError.message}`);
    }

    console.log(`[end-recurrence] Deleted ${deletedClasses?.length || 0} future classes`);

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

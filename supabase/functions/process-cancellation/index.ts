import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CancellationRequest {
  class_id: string;
  cancelled_by: string;
  reason: string;
  cancelled_by_type: 'student' | 'teacher';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { class_id, cancelled_by, reason, cancelled_by_type }: CancellationRequest = await req.json();

    // Get class details
    const { data: classData, error: classError } = await supabaseClient
      .from('classes')
      .select('*, profiles!classes_teacher_id_fkey(name)')
      .eq('id', class_id)
      .maybeSingle();

    if (classError || !classData) {
      throw new Error('Aula não encontrada');
    }

    // Get teacher's cancellation policy
    const { data: policy, error: policyError } = await supabaseClient
      .from('cancellation_policies')
      .select('*')
      .eq('teacher_id', classData.teacher_id)
      .eq('is_active', true)
      .maybeSingle();

    if (policyError && policyError.code !== 'PGRST116') {
      console.error('Error fetching cancellation policy:', policyError);
    } else if (!policy) {
      console.log('No active cancellation policy found, using defaults');
    }

    const hoursBeforeClass = policy?.hours_before_class || 24;
    const chargePercentage = policy?.charge_percentage || 0;
    
    // Calculate time difference
    const classDate = new Date(classData.class_date);
    const now = new Date();
    const hoursUntilClass = (classDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    let shouldCharge = false;
    
    // Only charge students who cancel late
    if (cancelled_by_type === 'student' && hoursUntilClass < hoursBeforeClass && chargePercentage > 0) {
      shouldCharge = true;
    }

    console.log('Processing cancellation:', {
      class_id,
      cancelled_by_type,
      hoursUntilClass,
      hoursBeforeClass,
      chargePercentage,
      shouldCharge
    });

    // Update class - always use 'cancelada' status, differentiate with charge_applied boolean
    const { error: updateError } = await supabaseClient
      .from('classes')
      .update({
        status: 'cancelada',
        cancellation_reason: reason,
        cancelled_at: now.toISOString(),
        cancelled_by: cancelled_by,
        charge_applied: shouldCharge,
        billed: false // Ensure it's marked as not billed yet
      })
      .eq('id', class_id);

    if (updateError) {
      console.error('Error updating class:', updateError);
      throw new Error('Erro ao atualizar aula');
    }

    // Check if teacher has financial module access (only if charging)
    if (shouldCharge) {
      const { data: hasFinancialModule, error: featureError } = await supabaseClient
        .rpc('teacher_has_financial_module', { teacher_id: classData.teacher_id });

      if (featureError) {
        console.error('Error checking financial module access:', featureError);
      }

      if (!hasFinancialModule) {
        console.log('Teacher does not have financial module access, removing charge');
        // Update class to remove charge if no financial module
        const { error: updateError } = await supabaseClient
          .from('classes')
          .update({ charge_applied: false })
          .eq('id', class_id);

        if (updateError) {
          console.error('Error updating class charge status:', updateError);
        }

        return new Response(JSON.stringify({ 
          success: true, 
          charged: false,
          message: 'Aula cancelada sem cobrança - módulo financeiro não disponível'
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      charged: shouldCharge,
      message: shouldCharge 
        ? 'Aula cancelada. A cobrança será incluída na próxima fatura mensal.' 
        : 'Aula cancelada sem cobrança'
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error('Error processing cancellation:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
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
        charge_applied: shouldCharge
      })
      .eq('id', class_id);

    if (updateError) {
      console.error('Error updating class:', updateError);
      throw new Error('Erro ao atualizar aula');
    }

    // Create cancellation invoice if needed
    if (shouldCharge) {
      // Get service price if available, otherwise default
      let baseAmount = 100; // Default fallback
      
      if (classData.service_id) {
        const { data: serviceData, error: serviceError } = await supabaseClient
          .from('class_services')
          .select('price')
          .eq('id', classData.service_id)
          .maybeSingle();
        
        if (serviceError && serviceError.code !== 'PGRST116') {
          console.error('Error fetching service data:', serviceError);
        }
        
        if (serviceData?.price) {
          baseAmount = Number(serviceData.price);
        }
      }
      
      const chargeAmount = (baseAmount * chargePercentage) / 100;

      const { error: invoiceError } = await supabaseClient
        .from('invoices')
        .insert({
          student_id: classData.student_id,
          teacher_id: classData.teacher_id,
          class_id: class_id,
          amount: chargeAmount,
          original_amount: baseAmount,
          description: `Cancelamento fora do prazo - ${classData.profiles?.name || 'Aula'} - ${new Date(classData.class_date).toLocaleDateString()}`,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
          status: 'pendente',
          invoice_type: 'cancellation',
          cancellation_policy_id: policy?.id
        });

      if (invoiceError) {
        console.error('Error creating cancellation invoice:', invoiceError);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      charged: shouldCharge,
      message: shouldCharge ? 'Aula cancelada com cobrança aplicada' : 'Aula cancelada sem cobrança'
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error('Error processing cancellation:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
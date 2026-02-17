import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, data?: any) => {
  console.log(`[PAYMENT-FAILURE-DOWNGRADE] ${step}:`, data || '');
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      logStep("Authentication failed", { error: authError });
      throw new Error('Unauthorized');
    }

    logStep("Processing payment failure downgrade", { userId: user.id });

    // Get request body
    const body = await req.json();
    const { selectedStudentIds, reason = 'payment_failure' } = body;

    // Start transaction-like operations
    logStep("Starting downgrade process", { reason, selectedStudentIds });

    // 1. Get user's current subscription and plan info (sequential queries — Etapa 0.6)
    const { data: currentSubscription, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select('id, user_id, plan_id, status, stripe_subscription_id, cancel_at_period_end, extra_students, extra_cost_cents')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (subError || !currentSubscription) {
      logStep("No active subscription found", { error: subError });
      throw new Error('No active subscription found');
    }

    // Fetch plan details separately (avoid FK join)
    let subscriptionPlan: any = null;
    if (currentSubscription.plan_id) {
      const { data: plan } = await supabaseClient
        .from('subscription_plans')
        .select('*')
        .eq('id', currentSubscription.plan_id)
        .maybeSingle();
      subscriptionPlan = plan;
    }

    // 2. Get all teacher's students
    const { data: allStudents, error: studentsError } = await supabaseClient
      .from('teacher_student_relationships')
      .select('id, student_id, student_name')
      .eq('teacher_id', user.id);

    if (studentsError) {
      logStep("Error fetching students", { error: studentsError });
      throw new Error('Failed to fetch students');
    }
    
    // 2.1 Get all teacher's dependents
    const { data: allDependents, error: dependentsError } = await supabaseClient
      .rpc('get_teacher_dependents', { p_teacher_id: user.id });
    
    if (dependentsError) {
      logStep("Error fetching dependents", { error: dependentsError });
      // Continue - dependents are optional
    }
    
    // 2.2 Get total count including dependents
    const { data: countData } = await supabaseClient
      .rpc('count_teacher_students_and_dependents', { p_teacher_id: user.id });
    
    const totalCount = countData?.[0] || { total_students: 0, regular_students: 0, dependents_count: 0 };
    logStep("Total students + dependents count", totalCount);

    // 3. Get free plan
    const { data: freePlan, error: freePlanError } = await supabaseClient
      .from('subscription_plans')
      .select('*')
      .eq('slug', 'free')
      .eq('is_active', true)
      .maybeSingle();

    if (freePlanError || !freePlan) {
      logStep("Free plan not found", { error: freePlanError });
      throw new Error('Free plan not found');
    }

    // 4. Cancel all pending invoices for all students
    logStep("Cancelling pending invoices", { teacherId: user.id });
    
    const { error: invoiceUpdateError } = await supabaseClient
      .from('invoices')
      .update({
        status: 'cancelada_por_falha_pagamento',
        updated_at: new Date().toISOString()
      })
      .eq('teacher_id', user.id)
      .in('status', ['pendente', 'vencida']);

    if (invoiceUpdateError) {
      logStep("Error cancelling invoices", { error: invoiceUpdateError });
      // Log but don't fail - continue with downgrade
    }

    // 5. If user selected specific students (meaning they had excess), remove unselected students
    if (selectedStudentIds && selectedStudentIds.length > 0) {
      const studentsToRemove = allStudents.filter(
        student => !selectedStudentIds.includes(student.student_id)
      );

      // Calculate dependents that will be cascade-deleted with their responsibles
      const removedResponsibleIds = studentsToRemove.map(s => s.student_id);
      const dependentsToRemove = (allDependents || []).filter(
        (dep: any) => removedResponsibleIds.includes(dep.responsible_id)
      );
      
      logStep("Removing excess students and their dependents", { 
        totalStudents: allStudents.length,
        totalDependents: allDependents?.length || 0,
        selectedCount: selectedStudentIds.length,
        studentsToRemoveCount: studentsToRemove.length,
        dependentsToRemoveCount: dependentsToRemove.length
      });

      if (studentsToRemove.length > 0) {
        // Call smart-delete-student for each student to remove
        // Note: smart-delete-student handles cascade deletion of dependents
        for (const student of studentsToRemove) {
          try {
            const { error: deleteError } = await supabaseClient.functions.invoke(
              'smart-delete-student',
              {
                body: {
                  studentId: student.student_id,
                  reason: 'payment_failure_downgrade'
                }
              }
            );

            if (deleteError) {
              logStep("Error deleting student", { 
                studentId: student.student_id, 
                error: deleteError 
              });
              // Log but continue with other students
            } else {
              logStep("Successfully deleted student (and their dependents)", { 
                studentId: student.student_id,
                studentName: student.student_name
              });
            }
          } catch (error) {
            logStep("Exception deleting student", { 
              studentId: student.student_id, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
        }
      }
    }

    // 6. Update subscription to free plan
    logStep("Updating subscription to free plan", { 
      currentPlanId: currentSubscription.plan_id,
      freePlanId: freePlan.id
    });

    const { error: subscriptionUpdateError } = await supabaseClient
      .from('user_subscriptions')
      .update({
        plan_id: freePlan.id,
        status: 'cancelled',
        cancel_at_period_end: false,
        extra_students: 0,
        extra_cost_cents: 0,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (subscriptionUpdateError) {
      logStep("Error updating subscription", { error: subscriptionUpdateError });
      throw new Error('Failed to update subscription');
    }

    // 7. Update user profile
    const { error: profileUpdateError } = await supabaseClient
      .from('profiles')
      .update({
        current_plan_id: freePlan.id,
        subscription_status: 'cancelled',
        subscription_end_date: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (profileUpdateError) {
      logStep("Error updating profile", { error: profileUpdateError });
      throw new Error('Failed to update profile');
    }

    // 8. Log audit trail
    try {
      await supabaseClient.rpc('write_audit_log', {
        p_target_teacher_id: user.id,
        p_table_name: 'user_subscriptions',
        p_record_id: currentSubscription.id,
        p_operation: 'UPDATE',
        p_old_data: currentSubscription,
        p_new_data: {
          ...currentSubscription,
          plan_id: freePlan.id,
          status: 'cancelled',
          reason: 'payment_failure_downgrade'
        }
      });
    } catch (auditError) {
      logStep("Error writing audit log", { error: auditError });
      // Don't fail the operation for audit errors
    }

    const studentsRemoved = selectedStudentIds ? allStudents.length - selectedStudentIds.length : 0;
    const removedResponsibleIds = selectedStudentIds 
      ? allStudents.filter(s => !selectedStudentIds.includes(s.student_id)).map(s => s.student_id)
      : [];
    const dependentsRemoved = (allDependents || []).filter(
      (dep: any) => removedResponsibleIds.includes(dep.responsible_id)
    ).length;
    
    logStep("Payment failure downgrade completed successfully", {
      userId: user.id,
      previousPlan: subscriptionPlan?.name || 'unknown',
      newPlan: freePlan.name,
      cancelledInvoices: true,
      studentsRemoved,
      dependentsRemoved
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Downgrade por falha de pagamento processado com sucesso',
      data: {
        newPlan: freePlan,
        cancelledInvoices: true,
        studentsProcessed: true
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in payment failure downgrade", { 
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return new Response(JSON.stringify({ 
      error: 'Erro ao processar downgrade por falha de pagamento',
      details: errorMessage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
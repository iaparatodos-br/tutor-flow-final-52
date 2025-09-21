import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DowngradeSelectionRequest {
  selected_student_ids: string[];
  new_plan_id: string;
}

interface DowngradeSelectionResponse {
  success: boolean;
  message: string;
  deleted_students_count?: number;
}

// Audit logging function
const logAuditEvent = async (
  supabaseClient: any, 
  userId: string, 
  action: string, 
  details: Record<string, any>, 
  metadata?: Record<string, any>
) => {
  try {
    const { error } = await supabaseClient
      .from('audit_logs')
      .insert({
        user_id: userId,
        action,
        details,
        metadata,
        created_at: new Date().toISOString(),
      });
    
    if (error) {
      console.error('Failed to log audit event:', error);
    }
  } catch (err) {
    console.error('Exception in audit logging:', err);
  }
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PLAN-DOWNGRADE-SELECTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error("Authentication failed");
    }
    
    const user = userData.user;
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Parse request body  
    const { selected_student_ids, new_plan_id }: DowngradeSelectionRequest = await req.json();
    
    if (!selected_student_ids || !Array.isArray(selected_student_ids)) {
      throw new Error("selected_student_ids is required and must be an array");
    }
    
    if (!new_plan_id) {
      throw new Error("new_plan_id is required");
    }

    logStep("Request parsed", { 
      selectedCount: selected_student_ids.length, 
      newPlanId: new_plan_id 
    });

    // Log downgrade initiation
    await logAuditEvent(supabaseClient, user.id, 'PLAN_DOWNGRADE_INITIATED', {
      target_plan_id: new_plan_id,
      selected_students_count: selected_student_ids.length,
      selected_student_ids,
    }, {
      user_email: user.email,
      timestamp: new Date().toISOString(),
    });

    // Get the new plan details
    const { data: newPlan, error: planError } = await supabaseClient
      .from('subscription_plans')
      .select('*')
      .eq('id', new_plan_id)
      .single();

    if (planError || !newPlan) {
      throw new Error(`Plan not found: ${new_plan_id}`);
    }

    logStep("New plan found", { 
      planName: newPlan.name, 
      planLimit: newPlan.student_limit 
    });

    // Validate selection count against plan limit
    if (selected_student_ids.length > newPlan.student_limit) {
      throw new Error(`Too many students selected. Plan limit: ${newPlan.student_limit}, Selected: ${selected_student_ids.length}`);
    }

    // Get all current students for this teacher
    const { data: allStudents, error: studentsError } = await supabaseClient
      .from('teacher_student_relationships')
      .select('*')
      .eq('teacher_id', user.id);

    if (studentsError) {
      throw new Error(`Error fetching students: ${studentsError.message}`);
    }

    logStep("Current students fetched", { totalCount: allStudents?.length || 0 });

    // Identify students to be removed (not in selected list)
    const studentsToRemove = allStudents?.filter(
      student => !selected_student_ids.includes(student.student_id)
    ) || [];

    logStep("Students to remove identified", { removeCount: studentsToRemove.length });

    // Delete unselected students using smart-delete-student
    let deletedCount = 0;
    const deleteResults = [];

    for (const studentRel of studentsToRemove) {
      try {
        logStep("Deleting student", { 
          studentId: studentRel.student_id, 
          relationshipId: studentRel.id 
        });

        const { data: deleteResult, error: deleteError } = await supabaseClient.functions.invoke(
          'smart-delete-student',
          {
            body: {
              student_id: studentRel.student_id,
              teacher_id: user.id,
              relationship_id: studentRel.id
            }
          }
        );

        if (deleteError) {
          logStep("Error deleting student", { 
            studentId: studentRel.student_id, 
            error: deleteError 
          });
          // Continue with other deletions even if one fails
          deleteResults.push({ 
            student_id: studentRel.student_id, 
            success: false, 
            error: deleteError.message 
          });
        } else {
          logStep("Student deleted successfully", { 
            studentId: studentRel.student_id, 
            action: deleteResult?.action 
          });
          deletedCount++;
          deleteResults.push({ 
            student_id: studentRel.student_id, 
            success: true, 
            action: deleteResult?.action 
          });

          // Log student deletion
          await logAuditEvent(supabaseClient, user.id, 'STUDENT_DELETED_DOWNGRADE', {
            student_id: studentRel.student_id,
            relationship_id: studentRel.id,
            deletion_action: deleteResult?.action,
            target_plan_id: new_plan_id,
          });
        }
      } catch (error) {
        logStep("Exception deleting student", { 
          studentId: studentRel.student_id, 
          error: error.message 
        });
        deleteResults.push({ 
          student_id: studentRel.student_id, 
          success: false, 
          error: error.message 
        });
      }
    }

    // Update user profile to new plan
    const { error: profileUpdateError } = await supabaseClient
      .from('profiles')
      .update({
        current_plan_id: new_plan_id,
        subscription_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileUpdateError) {
      logStep("Error updating user profile", { error: profileUpdateError });
      throw new Error(`Error updating user profile: ${profileUpdateError.message}`);
    }

    // Update subscription if exists  
    const { error: subscriptionUpdateError } = await supabaseClient
      .from('user_subscriptions')
      .update({
        plan_id: new_plan_id,
        extra_students: 0,
        extra_cost_cents: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (subscriptionUpdateError) {
      logStep("Error updating subscription", { error: subscriptionUpdateError });
      // Not critical - might not have an active subscription
    }

    logStep("Plan downgrade completed successfully", {
      newPlanId: new_plan_id,
      studentsKept: selected_student_ids.length,
      studentsDeleted: deletedCount,
      deleteResults: deleteResults
    });

    // Log downgrade completion
    await logAuditEvent(supabaseClient, user.id, 'PLAN_DOWNGRADE_COMPLETED', {
      target_plan_id: new_plan_id,
      students_kept_count: selected_student_ids.length,
      students_deleted_count: deletedCount,
      kept_student_ids: selected_student_ids,
      delete_results: deleteResults,
    }, {
      user_email: user.email,
      completion_timestamp: new Date().toISOString(),
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Downgrade completed successfully. ${deletedCount} students removed, ${selected_student_ids.length} students kept.`,
      deleted_students_count: deletedCount,
      delete_results: deleteResults
    } as DowngradeSelectionResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in plan downgrade selection", { 
      message: errorMessage, 
      timestamp: new Date().toISOString()
    });
    
    return new Response(JSON.stringify({ 
      success: false,
      message: errorMessage 
    } as DowngradeSelectionResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
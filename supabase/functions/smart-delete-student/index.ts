import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmartDeleteRequest {
  student_id: string;
  teacher_id: string;
  relationship_id: string;
  force?: boolean; // Force deletion even if there are pending classes (for dependents)
}

interface SmartDeleteResponse {
  success: boolean;
  action: 'unlinked' | 'deleted';
  message: string;
  dependents_deleted?: number;
  error?: string;
}

async function updateStripeSubscriptionQuantity(
  supabaseAdmin: any,
  teacherId: string,
  stripe: Stripe
) {
  try {
    // 1. Contar alunos + dependentes restantes usando RPC
    const { data: countData, error: countError } = await supabaseAdmin
      .rpc('count_teacher_students_and_dependents', { p_teacher_id: teacherId });

    if (countError) {
      console.error('Error counting students and dependents:', countError);
      throw countError;
    }

    const totalStudents = countData?.[0]?.total_students ?? 0;
    console.log('Total students + dependents after deletion:', {
      totalStudents,
      regularStudents: countData?.[0]?.regular_students,
      dependentsCount: countData?.[0]?.dependents_count
    });

    // 2. Buscar subscription ativa
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('stripe_subscription_id, plan_id')
      .eq('user_id', teacherId)
      .eq('status', 'active')
      .maybeSingle();

    if (subError || !subscription?.stripe_subscription_id) {
      console.log('No active subscription found, skipping Stripe update');
      return { success: true, message: 'No active subscription' };
    }

    // 3. Buscar subscription no Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );

    // 4. Encontrar o subscription item principal (o que tem o tiered pricing)
    const mainItem = stripeSubscription.items.data[0];

    if (!mainItem) {
      console.error('No subscription item found');
      return { success: false, message: 'No subscription item found' };
    }

    // 5. Atualizar quantity com o total de alunos + dependentes
    const newQuantity = Math.max(1, totalStudents || 0);
    
    await stripe.subscriptionItems.update(mainItem.id, {
      quantity: newQuantity,
      proration_behavior: 'create_prorations'
    });

    console.log('Updated subscription item:', { 
      itemId: mainItem.id, 
      oldQuantity: mainItem.quantity,
      newQuantity 
    });

    // 6. Buscar plano para calcular extras (para atualizar user_subscriptions)
    const { data: plan } = await supabaseAdmin
      .from('subscription_plans')
      .select('student_limit')
      .eq('id', subscription.plan_id)
      .maybeSingle();

    const extraStudents = Math.max(0, (totalStudents || 0) - (plan?.student_limit || 0));
    const extraCostCents = extraStudents * 500;

    // 7. Atualizar user_subscriptions
    await supabaseAdmin
      .from('user_subscriptions')
      .update({
        extra_students: extraStudents,
        extra_cost_cents: extraCostCents,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', teacherId)
      .eq('status', 'active');

    console.log('user_subscriptions updated:', { extraStudents, extraCostCents });

    return {
      success: true,
      totalStudents,
      newQuantity,
      extraStudents,
      extraCostCents
    };
  } catch (error) {
    console.error('Error updating Stripe subscription quantity:', error);
    throw error;
  }
}

// Check if a student (or their dependents) has pending/active classes WITH THIS TEACHER ONLY
async function checkPendingClasses(
  supabaseAdmin: any,
  studentId: string,
  teacherId: string
): Promise<{ hasPending: boolean; pendingCount: number; dependentsPending: number }> {
  // Check student's own pending classes WITH THIS TEACHER ONLY
  // Need to join with classes table to filter by teacher_id
  // Sequential queries to avoid FK join (Etapa 0.6)
  // First get teacher's class IDs, then filter participants
  const { data: teacherClasses } = await supabaseAdmin
    .from('classes')
    .select('id')
    .eq('teacher_id', teacherId);
  
  const teacherClassIds = (teacherClasses || []).map(c => c.id);
  
  const { data: studentClasses, error: studentError } = teacherClassIds.length > 0
    ? await supabaseAdmin
        .from('class_participants')
        .select('id, status, class_id')
        .eq('student_id', studentId)
        .in('class_id', teacherClassIds)
        .in('status', ['pendente', 'confirmada'])
    : { data: [] as any[], error: null };

  if (studentError) {
    console.error('Error checking student pending classes:', studentError);
  }

  const studentPending = studentClasses?.length || 0;

  // Check dependents' pending classes WITH THIS TEACHER ONLY
  const { data: dependents } = await supabaseAdmin
    .from('dependents')
    .select('id')
    .eq('responsible_id', studentId)
    .eq('teacher_id', teacherId);

  let dependentsPending = 0;
  if (dependents && dependents.length > 0) {
    const dependentIds = dependents.map((d: any) => d.id);
    
    // Reuse teacherClassIds from above (Etapa 0.6)
    const { data: depClasses, error: depError } = teacherClassIds.length > 0
      ? await supabaseAdmin
          .from('class_participants')
          .select('id, status, class_id')
          .in('dependent_id', dependentIds)
          .in('class_id', teacherClassIds)
          .in('status', ['pendente', 'confirmada'])
      : { data: [] as any[], error: null };

    if (depError) {
      console.error('Error checking dependent pending classes:', depError);
    }

    dependentsPending = depClasses?.length || 0;
  }

  const totalPending = studentPending + dependentsPending;
  
  console.log('Pending classes check:', {
    studentId,
    teacherId,
    studentPending,
    dependentsPending,
    totalPending
  });

  return {
    hasPending: totalPending > 0,
    pendingCount: studentPending,
    dependentsPending
  };
}

// Delete all dependents of a responsible party
async function deleteDependentsCascade(
  supabaseAdmin: any,
  responsibleId: string,
  teacherId: string
): Promise<{ success: boolean; deleted: number; error?: string }> {
  try {
    // Get all dependents for this responsible under this teacher
    const { data: dependents, error: fetchError } = await supabaseAdmin
      .from('dependents')
      .select('id, name')
      .eq('responsible_id', responsibleId)
      .eq('teacher_id', teacherId);

    if (fetchError) {
      console.error('Error fetching dependents:', fetchError);
      return { success: false, deleted: 0, error: fetchError.message };
    }

    if (!dependents || dependents.length === 0) {
      console.log('No dependents found for this responsible');
      return { success: true, deleted: 0 };
    }

    console.log(`Found ${dependents.length} dependents to delete:`, 
      dependents.map((d: any) => ({ id: d.id, name: d.name })));

    const dependentIds = dependents.map((d: any) => d.id);

    // Delete dependent-related records in order (respecting foreign keys)
    // CRITICAL ORDER: invoice_classes BEFORE class_participants (FK RESTRICT)
    
    // 1. Delete class_report_feedbacks for these dependents
    const { error: feedbackError } = await supabaseAdmin
      .from('class_report_feedbacks')
      .delete()
      .in('dependent_id', dependentIds);
    
    if (feedbackError) {
      console.error('Error deleting class_report_feedbacks:', feedbackError);
    }

    // 2. Delete material_access for these dependents
    const { error: materialError } = await supabaseAdmin
      .from('material_access')
      .delete()
      .in('dependent_id', dependentIds);
    
    if (materialError) {
      console.error('Error deleting material_access:', materialError);
    }

    // 3. Get participant IDs for these dependents to clean invoice_classes first
    const { data: depParticipants } = await supabaseAdmin
      .from('class_participants')
      .select('id')
      .in('dependent_id', dependentIds);
    
    const depParticipantIds = (depParticipants || []).map((p: any) => p.id);
    
    // 3a. Delete invoice_classes referencing these participants (BEFORE class_participants)
    if (depParticipantIds.length > 0) {
      const { error: invoiceClassesError } = await supabaseAdmin
        .from('invoice_classes')
        .delete()
        .in('participant_id', depParticipantIds);
      
      if (invoiceClassesError) {
        console.error('Error deleting invoice_classes for dependent participants:', invoiceClassesError);
      }
    }

    // 3b. Now safe to delete class_participants
    const { error: participantsError } = await supabaseAdmin
      .from('class_participants')
      .delete()
      .in('dependent_id', dependentIds);
    
    if (participantsError) {
      console.error('Error deleting class_participants:', participantsError);
    }

    // 4. Finally delete the dependents themselves
    const { error: deleteError } = await supabaseAdmin
      .from('dependents')
      .delete()
      .in('id', dependentIds);

    if (deleteError) {
      console.error('Error deleting dependents:', deleteError);
      return { success: false, deleted: 0, error: deleteError.message };
    }

    console.log(`Successfully deleted ${dependents.length} dependents`);
    return { success: true, deleted: dependents.length };

  } catch (error) {
    console.error('Error in deleteDependentsCascade:', error);
    return { success: false, deleted: 0, error: String(error) };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // AUTH: Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    const authUserId = userData.user.id;
    console.log('User authenticated:', authUserId);

    const { student_id, teacher_id, relationship_id, force = false }: SmartDeleteRequest = await req.json();

    // Validate required fields
    if (!student_id || !teacher_id || !relationship_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: student_id, teacher_id, relationship_id'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // AUTH: Verify the authenticated user IS the teacher
    if (teacher_id !== authUserId) {
      console.error('AUTHORIZATION FAILED: User trying to delete student from another teacher', { authUserId, teacher_id });
      return new Response(
        JSON.stringify({ success: false, error: 'Você só pode gerenciar seus próprios alunos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    console.log('Smart delete request:', { student_id, teacher_id, relationship_id, force });

    // Check for pending classes (student + dependents) unless force=true
    if (!force) {
      const pendingCheck = await checkPendingClasses(supabaseAdmin, student_id, teacher_id);
      
      if (pendingCheck.hasPending) {
        const message = pendingCheck.dependentsPending > 0
          ? `Este aluno possui ${pendingCheck.pendingCount} aula(s) pendente(s) e seus dependentes possuem ${pendingCheck.dependentsPending} aula(s) pendente(s). Cancele ou conclua as aulas antes de excluir.`
          : `Este aluno possui ${pendingCheck.pendingCount} aula(s) pendente(s). Cancele ou conclua as aulas antes de excluir.`;
        
        return new Response(
          JSON.stringify({
            success: false,
            error: message,
            pending_count: pendingCheck.pendingCount,
            dependents_pending: pendingCheck.dependentsPending
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400 
          }
        );
      }
    }

    // Check if student has other teacher relationships
    const { data: relationships, error: relationshipError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select('id, teacher_id')
      .eq('student_id', student_id);

    if (relationshipError) {
      console.error('Error checking relationships:', relationshipError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Error checking student relationships'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    console.log('Found relationships:', relationships);

    // Filter out the current relationship to see if there are others
    const otherRelationships = relationships?.filter(rel => rel.id !== relationship_id) || [];
    
    let dependentsDeleted = 0;

    if (otherRelationships.length > 0) {
      // Student has other teachers - just unlink (but still delete dependents for THIS teacher)
      console.log('Student has other teachers, unlinking only');
      
      // Delete dependents that belong to this teacher-responsible combination
      const cascadeResult = await deleteDependentsCascade(supabaseAdmin, student_id, teacher_id);
      if (!cascadeResult.success) {
        console.error('Warning: Failed to delete some dependents:', cascadeResult.error);
      }
      dependentsDeleted = cascadeResult.deleted;
      
      // Delete student_monthly_subscriptions BEFORE relationship (FK RESTRICT)
      const { error: smsUnlinkError } = await supabaseAdmin
        .from('student_monthly_subscriptions')
        .delete()
        .eq('relationship_id', relationship_id);
      
      if (smsUnlinkError) {
        console.error('Warning: Error deleting student_monthly_subscriptions:', smsUnlinkError);
      }

      const { error: unlinkError } = await supabaseAdmin
        .from('teacher_student_relationships')
        .delete()
        .eq('id', relationship_id)
        .eq('teacher_id', teacher_id); // Additional security check

      if (unlinkError) {
        console.error('Error unlinking student:', unlinkError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Error removing student relationship'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        );
      }

      // Atualizar quantity no Stripe
      try {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey) {
          const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
          const updateResult = await updateStripeSubscriptionQuantity(
            supabaseAdmin, 
            teacher_id, 
            stripe
          );
          console.log('Stripe subscription updated after unlink:', updateResult);
        } else {
          console.warn('STRIPE_SECRET_KEY not found, skipping Stripe update');
        }
      } catch (updateError) {
        console.error('Error updating Stripe subscription:', updateError);
        // Não falha - o aluno já foi removido com sucesso
      }

      const message = dependentsDeleted > 0
        ? `Aluno desvinculado e ${dependentsDeleted} dependente(s) excluído(s). O aluno continuará disponível para outros professores.`
        : 'Aluno desvinculado. Ele continuará disponível para outros professores.';

      return new Response(
        JSON.stringify({
          success: true,
          action: 'unlinked',
          message,
          dependents_deleted: dependentsDeleted
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    } else {
      // Student has no other teachers - delete completely
      console.log('Student has no other teachers, deleting completely');
      
      // First delete all dependents for this responsible (across all teachers since user is being deleted)
      // Note: We need to delete dependents for ALL teachers since the user account is going away
      const { data: allDependents } = await supabaseAdmin
        .from('dependents')
        .select('id')
        .eq('responsible_id', student_id);

      if (allDependents && allDependents.length > 0) {
        const allDependentIds = allDependents.map((d: any) => d.id);
        
        // Delete dependent-related records
        // CRITICAL ORDER: invoice_classes BEFORE class_participants (FK RESTRICT)
        await supabaseAdmin.from('class_report_feedbacks').delete().in('dependent_id', allDependentIds);
        await supabaseAdmin.from('material_access').delete().in('dependent_id', allDependentIds);
        
        // Get participant IDs to clean invoice_classes first
        const { data: allDepParticipants } = await supabaseAdmin
          .from('class_participants')
          .select('id')
          .in('dependent_id', allDependentIds);
        
        const allDepParticipantIds = (allDepParticipants || []).map((p: any) => p.id);
        if (allDepParticipantIds.length > 0) {
          await supabaseAdmin.from('invoice_classes').delete().in('participant_id', allDepParticipantIds);
        }
        
        await supabaseAdmin.from('class_participants').delete().in('dependent_id', allDependentIds);
        
        const { error: deleteDepsError } = await supabaseAdmin
          .from('dependents')
          .delete()
          .in('id', allDependentIds);
        
        if (deleteDepsError) {
          console.error('Error deleting all dependents:', deleteDepsError);
        } else {
          dependentsDeleted = allDependents.length;
          console.log(`Deleted ${dependentsDeleted} dependents for user being deleted`);
        }
      }

      // Delete student_monthly_subscriptions BEFORE relationship (FK RESTRICT)
      const { error: smsDeleteError } = await supabaseAdmin
        .from('student_monthly_subscriptions')
        .delete()
        .eq('relationship_id', relationship_id);
      
      if (smsDeleteError) {
        console.error('Error deleting student_monthly_subscriptions:', smsDeleteError);
      }

      // Also clean invoice_classes and class_participants for the student's own participations
      const { data: studentParticipants } = await supabaseAdmin
        .from('class_participants')
        .select('id')
        .eq('student_id', student_id);
      
      const studentParticipantIds = (studentParticipants || []).map((p: any) => p.id);
      if (studentParticipantIds.length > 0) {
        await supabaseAdmin.from('invoice_classes').delete().in('participant_id', studentParticipantIds);
      }
      await supabaseAdmin.from('class_participants').delete().eq('student_id', student_id);

      // Delete the relationship
      const { error: relationshipDeleteError } = await supabaseAdmin
        .from('teacher_student_relationships')
        .delete()
        .eq('id', relationship_id)
        .eq('teacher_id', teacher_id);
      
      if (relationshipDeleteError) {
        console.error('Error deleting relationship:', relationshipDeleteError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Error removing student relationship'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        );
      }
      
      // Try to delete from auth.users (this will cascade to profiles due to foreign key)
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(student_id);
      
      if (authDeleteError) {
        console.error('Error deleting user from auth:', authDeleteError);
        
        // If auth deletion fails, try to delete profile directly as fallback
        console.log('Attempting to delete profile directly as fallback');
        
        const { error: profileDeleteError } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', student_id);

        if (profileDeleteError) {
          console.error('Error deleting profile:', profileDeleteError);
          // Don't return error here since relationship was already deleted
          console.log('Profile deletion failed, but relationship was removed successfully');
        }
      }

      // Atualizar quantity no Stripe
      try {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey) {
          const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
          const updateResult = await updateStripeSubscriptionQuantity(
            supabaseAdmin, 
            teacher_id, 
            stripe
          );
          console.log('Stripe subscription updated after delete:', updateResult);
        } else {
          console.warn('STRIPE_SECRET_KEY not found, skipping Stripe update');
        }
      } catch (updateError) {
        console.error('Error updating Stripe subscription:', updateError);
        // Não falha - o aluno já foi removido com sucesso
      }

      const message = dependentsDeleted > 0
        ? `Aluno e ${dependentsDeleted} dependente(s) excluídos permanentemente. O e-mail agora pode ser reutilizado.`
        : 'Aluno excluído permanentemente. O e-mail agora pode ser reutilizado.';

      return new Response(
        JSON.stringify({
          success: true,
          action: 'deleted',
          message,
          dependents_deleted: dependentsDeleted
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }
    
  } catch (error) {
    console.error('Smart delete error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

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
}

interface SmartDeleteResponse {
  success: boolean;
  action: 'unlinked' | 'deleted';
  message: string;
  error?: string;
}

async function updateStripeSubscriptionQuantity(
  supabaseAdmin: any,
  teacherId: string,
  stripe: Stripe
) {
  try {
    // 1. Contar alunos restantes
    const { count: totalStudents } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', teacherId);

    console.log('Total students after deletion:', totalStudents);

    // 2. Buscar subscription ativa
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('stripe_subscription_id, plan_id')
      .eq('user_id', teacherId)
      .eq('status', 'active')
      .single();

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

    // 5. Atualizar quantity com o total de alunos
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
      .single();

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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { student_id, teacher_id, relationship_id }: SmartDeleteRequest = await req.json();

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

    console.log('Smart delete request:', { student_id, teacher_id, relationship_id });

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
    
    if (otherRelationships.length > 0) {
      // Student has other teachers - just unlink
      console.log('Student has other teachers, unlinking only');
      
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

      return new Response(
        JSON.stringify({
          success: true,
          action: 'unlinked',
          message: 'Aluno desvinculado. Ele continuará disponível para outros professores.'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    } else {
      // Student has no other teachers - delete completely
      console.log('Student has no other teachers, deleting completely');
      
      // First, always delete the relationship to ensure it's removed
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

      return new Response(
        JSON.stringify({
          success: true,
          action: 'deleted',
          message: 'Aluno excluído permanentemente. O e-mail agora pode ser reutilizado.'
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
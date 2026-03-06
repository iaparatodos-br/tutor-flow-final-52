import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { todayDateString, DEFAULT_TIMEZONE } from '@/utils/timezone';
import type { 
  MonthlySubscriptionWithCount,
  MonthlySubscriptionFormData,
  AssignedStudent,
  TeacherStudentRelationship,
} from '@/types/monthly-subscriptions';

// ============================================
// Query Hooks
// ============================================

/**
 * Lista todas as mensalidades do professor logado
 */
export function useMonthlySubscriptions(includeInactive = false) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['monthly-subscriptions', user?.id, includeInactive],
    queryFn: async (): Promise<MonthlySubscriptionWithCount[]> => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .rpc('get_subscriptions_with_students', { p_teacher_id: user.id });

      if (error) throw error;

      // Filtra inativos se necessário
      const subscriptions = (data || []) as MonthlySubscriptionWithCount[];
      return includeInactive 
        ? subscriptions 
        : subscriptions.filter(s => s.is_active);
    },
    enabled: !!user?.id,
  });
}

/**
 * Lista alunos atribuídos a uma mensalidade específica
 */
export function useSubscriptionStudents(subscriptionId: string | null) {
  return useQuery({
    queryKey: ['subscription-students', subscriptionId],
    queryFn: async (): Promise<AssignedStudent[]> => {
      if (!subscriptionId) throw new Error('Subscription ID required');

      const { data, error } = await supabase
        .rpc('get_subscription_assigned_students', { p_subscription_id: subscriptionId });

      if (error) throw error;
      return (data || []) as AssignedStudent[];
    },
    enabled: !!subscriptionId,
  });
}

/**
 * Lista alunos disponíveis para atribuição (sem mensalidade ativa)
 */
export function useAvailableStudentsForSubscription(subscriptionId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['available-students-for-subscription', user?.id, subscriptionId],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      // Buscar todos os relacionamentos do professor usando a RPC existente
      const { data: relationships, error: relError } = await supabase
        .rpc('get_teacher_students', { teacher_user_id: user.id });

      if (relError) throw relError;

      // Para cada relacionamento, verificar se já tem mensalidade ativa
      const studentsWithStatus = await Promise.all(
        (relationships || []).map(async (rel) => {
          const { data: hasActive } = await supabase
            .rpc('check_student_has_active_subscription', { 
              p_relationship_id: rel.relationship_id,
              p_exclude_subscription_id: subscriptionId 
            });
          
          return {
            relationship_id: rel.relationship_id,
            student_id: rel.student_id,
            student_name: rel.student_name || '',
            student_email: rel.student_email || '',
            billing_day: rel.billing_day,
            has_active_subscription: hasActive || false,
          };
        })
      );

      return studentsWithStatus;
    },
    enabled: !!user?.id,
  });
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Cria uma nova mensalidade e atribui alunos
 */
export function useCreateMonthlySubscription() {
  const { t } = useTranslation('monthlySubscriptions');
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: MonthlySubscriptionFormData) => {
      if (!user?.id) throw new Error('User not authenticated');

      // 1. Criar a mensalidade
      const { data: subscription, error: subError } = await supabase
        .from('monthly_subscriptions')
        .insert({
          teacher_id: user.id,
          name: formData.name,
          description: formData.description || null,
          price: formData.price,
          is_active: true,
        })
        .select()
        .single();

      if (subError) throw subError;

      // 2. Atribuir alunos selecionados
      if (formData.selectedStudents.length > 0) {
        const assignments = formData.selectedStudents.map(relationshipId => ({
          subscription_id: subscription.id,
          relationship_id: relationshipId,
          starts_at: todayDateString(profile?.timezone || DEFAULT_TIMEZONE),
          is_active: true,
        }));

        const { error: assignError } = await supabase
          .from('student_monthly_subscriptions')
          .insert(assignments);

        if (assignError) throw assignError;
      }

      return subscription;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['available-students-for-subscription'] });
      toast.success(t('messages.createSuccess'));
    },
    onError: (error) => {
      console.error('Error creating subscription:', error);
      toast.error(t('messages.saveError'));
    },
  });
}

/**
 * Atualiza uma mensalidade existente
 */
export function useUpdateMonthlySubscription() {
  const { t } = useTranslation('monthlySubscriptions');
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      formData 
    }: { 
      id: string; 
      formData: Partial<MonthlySubscriptionFormData> 
    }) => {
      const updateData: Record<string, unknown> = {};

      if (formData.name !== undefined) updateData.name = formData.name;
      if (formData.description !== undefined) updateData.description = formData.description || null;
      if (formData.price !== undefined) updateData.price = formData.price;
      if (formData.is_active !== undefined) updateData.is_active = formData.is_active;

      const { data, error } = await supabase
        .from('monthly_subscriptions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Cascade: deactivate all linked students when subscription is deactivated
      if (formData.is_active === false) {
        await supabase
          .from('student_monthly_subscriptions')
          .update({ is_active: false, ends_at: todayDateString(profile?.timezone || DEFAULT_TIMEZONE) })
          .eq('subscription_id', id)
          .eq('is_active', true);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-students'] });
      queryClient.invalidateQueries({ queryKey: ['available-students-for-subscription'] });
      toast.success(t('messages.updateSuccess'));
    },
    onError: (error) => {
      console.error('Error updating subscription:', error);
      toast.error(t('messages.updateError'));
    },
  });
}

/**
 * Ativa ou desativa uma mensalidade (soft delete)
 */
export function useToggleMonthlySubscription() {
  const { t } = useTranslation('monthlySubscriptions');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('monthly_subscriptions')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-students'] });
      toast.success(
        variables.isActive 
          ? t('messages.activateSuccess') 
          : t('messages.deactivateSuccess')
      );
    },
    onError: (error) => {
      console.error('Error toggling subscription:', error);
      toast.error(t('messages.toggleError'));
    },
  });
}

/**
 * Atribui um aluno a uma mensalidade
 */
export function useAssignStudentToSubscription() {
  const { t } = useTranslation('monthlySubscriptions');
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      subscriptionId, 
      relationshipId, 
      startsAt 
    }: { 
      subscriptionId: string; 
      relationshipId: string; 
      startsAt?: string;
    }) => {
      // Verificar se já tem mensalidade ativa
      const { data: hasActive } = await supabase
        .rpc('check_student_has_active_subscription', { 
          p_relationship_id: relationshipId 
        });

      if (hasActive) {
        throw new Error('STUDENT_ALREADY_HAS_SUBSCRIPTION');
      }

      // Inserir atribuição
      const { data, error } = await supabase
        .from('student_monthly_subscriptions')
        .insert({
          subscription_id: subscriptionId,
          relationship_id: relationshipId,
          starts_at: startsAt || todayDateString(profile?.timezone || DEFAULT_TIMEZONE),
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-students'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['available-students-for-subscription'] });
      toast.success(t('messages.studentAssigned'));
    },
    onError: (error) => {
      if (error.message === 'STUDENT_ALREADY_HAS_SUBSCRIPTION') {
        toast.error(t('messages.studentAlreadyHasSubscription'));
      } else {
        console.error('Error assigning student:', error);
        toast.error(t('messages.assignError'));
      }
    },
  });
}

/**
 * Remove um aluno de uma mensalidade (soft delete)
 */
export function useRemoveStudentFromSubscription() {
  const { t } = useTranslation('monthlySubscriptions');
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      assignmentId 
    }: { 
      assignmentId: string;
    }) => {
      const { data, error } = await supabase
        .from('student_monthly_subscriptions')
        .update({ 
          is_active: false,
          ends_at: todayDateString(profile?.timezone || DEFAULT_TIMEZONE),
        })
        .eq('id', assignmentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-students'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['available-students-for-subscription'] });
      toast.success(t('messages.studentRemoved'));
    },
    onError: (error) => {
      console.error('Error removing student:', error);
      toast.error(t('messages.removeError'));
    },
  });
}

/**
 * Atribuição em lote de alunos
 */
export function useBulkAssignStudents() {
  const { t } = useTranslation('monthlySubscriptions');
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      subscriptionId, 
      toAdd, 
      toRemove,
      startsAt,
    }: { 
      subscriptionId: string;
      toAdd: string[]; // relationship_ids
      toRemove: string[]; // assignment_ids
      startsAt?: string;
    }) => {
      // 1. Remover atribuições
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('student_monthly_subscriptions')
          .update({ 
            is_active: false,
            ends_at: todayDateString(profile?.timezone || DEFAULT_TIMEZONE),
          })
          .in('id', toRemove);

        if (removeError) throw removeError;
      }

      // 2. Adicionar novas atribuições
      if (toAdd.length > 0) {
        const assignments = toAdd.map(relationshipId => ({
          subscription_id: subscriptionId,
          relationship_id: relationshipId,
          starts_at: startsAt || todayDateString(profile?.timezone || DEFAULT_TIMEZONE),
          is_active: true,
        }));

        const { error: addError } = await supabase
          .from('student_monthly_subscriptions')
          .insert(assignments);

        if (addError) throw addError;
      }

      return { added: toAdd.length, removed: toRemove.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['subscription-students'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['available-students-for-subscription'] });
      
      if (result.added > 0 && result.removed > 0) {
        toast.success(t('messages.bulkUpdateSuccess'));
      } else if (result.added > 0) {
        toast.success(t('messages.studentsAssignedSuccess', { count: result.added }));
      } else if (result.removed > 0) {
        toast.success(t('messages.studentsRemovedSuccess', { count: result.removed }));
      }
    },
    onError: (error) => {
      console.error('Error bulk updating students:', error);
      toast.error(t('messages.bulkUpdateError'));
    },
  });
}

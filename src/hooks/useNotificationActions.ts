import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { NotificationStatus } from '@/types/inbox';

// =====================================================
// UPDATE NOTIFICATION STATUS
// =====================================================
interface UpdateStatusParams {
  notificationId: string;
  newStatus: NotificationStatus;
}

export const useUpdateNotificationStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation('inbox');

  return useMutation({
    mutationFn: async ({ notificationId, newStatus }: UpdateStatusParams) => {
      const { data, error } = await supabase.rpc('update_notification_status', {
        p_notification_id: notificationId,
        p_new_status: newStatus,
      });

      if (error) {
        console.error('[useUpdateNotificationStatus] Error:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (_, { newStatus }) => {
      // Invalidate all notification queries
      queryClient.invalidateQueries({ queryKey: ['teacher-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['teacher-notifications-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['teacher-notification-counts'] });

      // Show success toast based on action
      const messages: Record<NotificationStatus, string> = {
        inbox: t('actions.movedToInbox'),
        saved: t('actions.saved'),
        done: t('actions.markedDone'),
      };

      toast({
        description: messages[newStatus],
      });
    },
    onError: (error) => {
      console.error('[useUpdateNotificationStatus] Mutation error:', error);
      toast({
        variant: 'destructive',
        title: t('errors.updateFailed'),
        description: t('errors.tryAgain'),
      });
    },
  });
};

// =====================================================
// MARK NOTIFICATION AS READ
// =====================================================
export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { data, error } = await supabase.rpc('mark_notification_read', {
        p_notification_id: notificationId,
      });

      if (error) {
        console.error('[useMarkNotificationRead] Error:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      // Silently update counts (no toast needed for read status)
      queryClient.invalidateQueries({ queryKey: ['teacher-notification-counts'] });
      // Optimistically update local cache could be added here
    },
  });
};

// =====================================================
// BATCH UPDATE STATUS (for bulk actions)
// =====================================================
interface BatchUpdateParams {
  notificationIds: string[];
  newStatus: NotificationStatus;
}

export const useBatchUpdateStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation('inbox');

  return useMutation({
    mutationFn: async ({ notificationIds, newStatus }: BatchUpdateParams) => {
      // Process in parallel
      const results = await Promise.allSettled(
        notificationIds.map((id) =>
          supabase.rpc('update_notification_status', {
            p_notification_id: id,
            p_new_status: newStatus,
          })
        )
      );

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.filter((r) => r.status === 'rejected').length;

      return { successCount, failCount };
    },
    onSuccess: ({ successCount, failCount }, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['teacher-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['teacher-notifications-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['teacher-notification-counts'] });

      if (failCount === 0) {
        toast({
          description: t('actions.batchSuccess', { count: successCount }),
        });
      } else {
        toast({
          variant: 'destructive',
          description: t('actions.batchPartial', { success: successCount, failed: failCount }),
        });
      }
    },
    onError: (error) => {
      console.error('[useBatchUpdateStatus] Error:', error);
      toast({
        variant: 'destructive',
        title: t('errors.updateFailed'),
      });
    },
  });
};

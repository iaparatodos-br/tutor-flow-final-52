import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { 
  TeacherNotification, 
  NotificationCounts, 
  NotificationFilters 
} from '@/types/inbox';

// =====================================================
// FETCH NOTIFICATION COUNTS
// =====================================================
export const useNotificationCounts = () => {
  return useQuery({
    queryKey: ['teacher-notification-counts'],
    queryFn: async (): Promise<NotificationCounts> => {
      const { data, error } = await supabase.rpc('get_teacher_notification_counts');
      
      if (error) {
        console.error('[useNotificationCounts] Error:', error);
        throw error;
      }
      
      // RPC returns array with single row
      const result = Array.isArray(data) ? data[0] : data;
      
      return {
        inbox_count: result?.inbox_count ?? 0,
        inbox_unread_count: result?.inbox_unread_count ?? 0,
        saved_count: result?.saved_count ?? 0,
        done_count: result?.done_count ?? 0,
      };
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });
};

// =====================================================
// FETCH NOTIFICATIONS WITH PAGINATION
// =====================================================
interface UseTeacherNotificationsParams {
  filters: NotificationFilters;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

export const useTeacherNotifications = ({
  filters,
  limit = 20,
  offset = 0,
  enabled = true,
}: UseTeacherNotificationsParams) => {
  return useQuery({
    queryKey: ['teacher-notifications', filters, limit, offset],
    queryFn: async (): Promise<TeacherNotification[]> => {
      const { data, error } = await supabase.rpc('get_teacher_notifications', {
        p_status: filters.status,
        p_is_read: filters.isRead ?? null,
        p_category: filters.category ?? null,
        p_limit: limit,
        p_offset: offset,
      });
      
      if (error) {
        console.error('[useTeacherNotifications] Error:', error);
        throw error;
      }
      
      return (data as TeacherNotification[]) ?? [];
    },
    enabled,
    staleTime: 30 * 1000, // 30 seconds
  });
};

// =====================================================
// INFINITE QUERY FOR LOAD MORE
// =====================================================
import { useInfiniteQuery } from '@tanstack/react-query';

export const useTeacherNotificationsInfinite = ({
  filters,
  pageSize = 20,
  enabled = true,
}: {
  filters: NotificationFilters;
  pageSize?: number;
  enabled?: boolean;
}) => {
  return useInfiniteQuery({
    queryKey: ['teacher-notifications-infinite', filters],
    queryFn: async ({ pageParam = 0 }): Promise<TeacherNotification[]> => {
      const { data, error } = await supabase.rpc('get_teacher_notifications', {
        p_status: filters.status,
        p_is_read: filters.isRead ?? null,
        p_category: filters.category ?? null,
        p_limit: pageSize,
        p_offset: pageParam,
      });
      
      if (error) {
        console.error('[useTeacherNotificationsInfinite] Error:', error);
        throw error;
      }
      
      return (data as TeacherNotification[]) ?? [];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // If last page has fewer items than pageSize, no more pages
      if (lastPage.length < pageSize) {
        return undefined;
      }
      // Return the next offset
      return allPages.length * pageSize;
    },
    enabled,
    staleTime: 30 * 1000,
  });
};

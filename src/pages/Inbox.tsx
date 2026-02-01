import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { 
  InboxTabs, 
  InboxFilters, 
  NotificationItem, 
  InboxEmptyState, 
  InboxSkeleton 
} from '@/components/Inbox';
import { 
  useNotificationCounts, 
  useTeacherNotificationsInfinite 
} from '@/hooks/useTeacherNotifications';
import type { NotificationStatus, NotificationCategory, NotificationFilters } from '@/types/inbox';

export default function Inbox() {
  const { t } = useTranslation('inbox');

  // State
  const [activeTab, setActiveTab] = useState<NotificationStatus>('inbox');
  const [readFilter, setReadFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory | 'all'>('all');

  // Build filters object
  const filters: NotificationFilters = useMemo(() => ({
    status: activeTab,
    isRead: readFilter === 'all' ? undefined : readFilter === 'read',
    category: categoryFilter === 'all' ? undefined : categoryFilter,
  }), [activeTab, readFilter, categoryFilter]);

  // Queries
  const { data: counts, isLoading: countsLoading } = useNotificationCounts();
  const {
    data: notificationsData,
    isLoading: notificationsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useTeacherNotificationsInfinite({ filters, pageSize: 20 });

  // Flatten paginated data
  const notifications = useMemo(() => {
    return notificationsData?.pages.flat() ?? [];
  }, [notificationsData]);

  const isLoading = countsLoading || notificationsLoading;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>

        {/* Tabs */}
        <InboxTabs
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            // Reset filters when changing tabs
            setReadFilter('all');
            setCategoryFilter('all');
          }}
          counts={counts}
          isLoading={countsLoading}
        />

        {/* Filters */}
        <InboxFilters
          readFilter={readFilter}
          onReadFilterChange={setReadFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
        />

        {/* Content */}
        <div className="space-y-3">
          {isLoading && <InboxSkeleton />}

          {!isLoading && notifications.length === 0 && (
            <InboxEmptyState status={activeTab} />
          )}

          {!isLoading && notifications.length > 0 && (
            <>
              {notifications.map((notification) => (
                <NotificationItem key={notification.id} notification={notification} />
              ))}

              {/* Load More Button */}
              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('pagination.loading')}
                      </>
                    ) : (
                      t('pagination.loadMore')
                    )}
                  </Button>
                </div>
              )}

              {!hasNextPage && notifications.length > 0 && (
                <p className="text-center text-sm text-muted-foreground pt-4">
                  {t('pagination.noMore')}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

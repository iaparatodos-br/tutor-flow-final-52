import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { NotificationStatus, NotificationCounts } from '@/types/inbox';
import { Inbox, Bookmark, CheckCircle2 } from 'lucide-react';

interface InboxTabsProps {
  activeTab: NotificationStatus;
  onTabChange: (tab: NotificationStatus) => void;
  counts: NotificationCounts | undefined;
  isLoading?: boolean;
}

export function InboxTabs({ activeTab, onTabChange, counts, isLoading }: InboxTabsProps) {
  const { t } = useTranslation('inbox');

  const tabs: { value: NotificationStatus; icon: React.ReactNode; label: string; count: number }[] = [
    {
      value: 'inbox',
      icon: <Inbox className="h-4 w-4" />,
      label: t('tabs.inbox'),
      count: counts?.inbox_count ?? 0,
    },
    {
      value: 'saved',
      icon: <Bookmark className="h-4 w-4" />,
      label: t('tabs.saved'),
      count: counts?.saved_count ?? 0,
    },
    {
      value: 'done',
      icon: <CheckCircle2 className="h-4 w-4" />,
      label: t('tabs.done'),
      count: counts?.done_count ?? 0,
    },
  ];

  return (
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as NotificationStatus)}>
      <TabsList className="grid w-full grid-cols-3">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="flex items-center gap-2"
            disabled={isLoading}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count > 0 && (
              <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">
                {tab.count > 99 ? '99+' : tab.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

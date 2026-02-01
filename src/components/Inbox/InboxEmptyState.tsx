import { useTranslation } from 'react-i18next';
import { Inbox, Bookmark, CheckCircle2 } from 'lucide-react';
import type { NotificationStatus } from '@/types/inbox';

interface InboxEmptyStateProps {
  status: NotificationStatus;
}

export function InboxEmptyState({ status }: InboxEmptyStateProps) {
  const { t } = useTranslation('inbox');

  const config: Record<NotificationStatus, { icon: React.ReactNode; title: string; description: string }> = {
    inbox: {
      icon: <Inbox className="h-12 w-12 text-muted-foreground/50" />,
      title: t('empty.inbox.title'),
      description: t('empty.inbox.description'),
    },
    saved: {
      icon: <Bookmark className="h-12 w-12 text-muted-foreground/50" />,
      title: t('empty.saved.title'),
      description: t('empty.saved.description'),
    },
    done: {
      icon: <CheckCircle2 className="h-12 w-12 text-muted-foreground/50" />,
      title: t('empty.done.title'),
      description: t('empty.done.description'),
    },
  };

  const { icon, title, description } = config[status];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon}
      <h3 className="mt-4 text-lg font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">{description}</p>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useProfile } from '@/contexts/ProfileContext';
import { formatInTimezone } from '@/utils/timezone';
import { 
  Clock, 
  Gift, 
  AlertCircle, 
  FileText,
  CheckCircle2,
  Bookmark,
  Undo2,
  BellOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { 
  TeacherNotification, 
  NotificationCategory,
  NotificationStatus,
} from '@/types/inbox';
import { 
  getUrgencyLevel, 
  URGENCY_STYLES, 
  READ_STYLES,
  CATEGORY_CONFIG,
  buildNotificationDeepLink,
} from '@/types/inbox';
import { useUpdateNotificationStatus, useMarkNotificationRead, useDeleteNotification } from '@/hooks/useNotificationActions';

// Icon mapping
const CATEGORY_ICONS: Record<NotificationCategory, React.ReactNode> = {
  pending_past_classes: <Clock className="h-5 w-5" />,
  amnesty_eligible: <Gift className="h-5 w-5" />,
  overdue_invoices: <AlertCircle className="h-5 w-5" />,
  pending_reports: <FileText className="h-5 w-5" />,
};

interface NotificationItemProps {
  notification: TeacherNotification;
}

export function NotificationItem({ notification }: NotificationItemProps) {
  const { t, i18n } = useTranslation('inbox');
  const navigate = useNavigate();
  const { profile } = useProfile();
  const updateStatus = useUpdateNotificationStatus();
  const markRead = useMarkNotificationRead();
  const deleteNotification = useDeleteNotification();

  const userTimezone = profile?.timezone || 'America/Sao_Paulo';
  const urgency = getUrgencyLevel(notification);
  const urgencyStyles = URGENCY_STYLES[urgency];
  const readStyles = notification.is_read ? READ_STYLES.read : READ_STYLES.unread;
  const categoryConfig = CATEGORY_CONFIG[notification.category];
  const locale = i18n.language === 'pt' ? ptBR : undefined;

  // Format relative time
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale,
  });

  // Handle navigation
  const handleNavigate = () => {
    // Mark as read when clicking
    if (!notification.is_read) {
      markRead.mutate(notification.id);
    }
    
    const deepLink = buildNotificationDeepLink(notification);
    navigate(deepLink);
  };

  // Handle status change
  const handleStatusChange = (newStatus: NotificationStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    updateStatus.mutate({ notificationId: notification.id, newStatus });
  };

  // Handle permanent deletion
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('[NotificationItem] Deleting notification:', notification.id);
    deleteNotification.mutate(notification.id);
  };

  // Build description text
  const getDescription = () => {
    if (notification.source_type === 'invoice') {
      const amount = notification.invoice_amount?.toFixed(2) ?? '0.00';
      // invoice_due_date is date-only (YYYY-MM-DD) — avoid timezone offset
      const dueDate = notification.invoice_due_date
        ? (() => { const p = notification.invoice_due_date.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : notification.invoice_due_date; })()
        : '';
      return `R$ ${amount} • ${dueDate}`;
    }

    if (notification.class_date) {
      return formatInTimezone(notification.class_date, "dd/MM/yyyy 'às' HH:mm", userTimezone);
    }

    return '';
  };

  return (
    <Card
      className={cn(
        'p-4 cursor-pointer transition-all hover:shadow-md',
        urgencyStyles.border,
        urgencyStyles.bg,
        readStyles.opacity,
        'group'
      )}
      onClick={handleNavigate}
    >
      <div className="flex items-start gap-4">
        {/* Category Icon */}
        <div className={cn('mt-1', categoryConfig.colorClass)}>
          {CATEGORY_ICONS[notification.category]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className={cn('text-sm', readStyles.fontWeight)}>
                {t(`categories.${notification.category}.title`)}
              </h4>
              <p className="text-sm text-muted-foreground truncate">
                {notification.student_name || t('student.unknown')}
              </p>
            </div>
            <Badge variant={categoryConfig.badgeVariant} className="shrink-0">
              {notification.service_name || t(`categories.${notification.category}.title`)}
            </Badge>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground mt-1">
            {getDescription()}
          </p>

          {/* Days overdue indicator */}
          {notification.days_overdue > 0 && (
            <p className="text-xs text-destructive mt-1 font-medium">
              {t('invoice.daysOverdue', { count: notification.days_overdue })}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">{timeAgo}</span>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {notification.status === 'inbox' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={(e) => handleStatusChange('saved', e)}
                    title={t('actions.save')}
                  >
                    <Bookmark className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={(e) => handleStatusChange('done', e)}
                    title={t('actions.markDone')}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </>
              )}

              {notification.status === 'saved' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={(e) => handleStatusChange('inbox', e)}
                    title={t('actions.undo')}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={(e) => handleStatusChange('done', e)}
                    title={t('actions.markDone')}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </>
              )}

              {notification.status === 'done' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={(e) => handleStatusChange('inbox', e)}
                  title={t('actions.undo')}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                title={t('actions.dismiss')}
              >
                <BellOff className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Unread indicator */}
        {!notification.is_read && (
          <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
        )}
      </div>
    </Card>
  );
}

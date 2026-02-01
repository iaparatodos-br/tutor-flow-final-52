import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useNotificationCounts } from '@/hooks/useTeacherNotifications';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const navigate = useNavigate();
  const { data: counts, isLoading } = useNotificationCounts();

  const unreadCount = counts?.inbox_unread_count ?? 0;
  const hasUnread = unreadCount > 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => navigate('/inbox')}
      aria-label={`Notificações${hasUnread ? ` (${unreadCount} não lidas)` : ''}`}
    >
      <Bell className={cn('h-5 w-5', hasUnread && 'text-primary')} />
      
      {/* Badge de contagem */}
      {hasUnread && !isLoading && (
        <span
          className={cn(
            'absolute -top-1 -right-1 flex items-center justify-center',
            'min-w-[18px] h-[18px] px-1 rounded-full',
            'bg-destructive text-destructive-foreground',
            'text-xs font-medium',
            'animate-in zoom-in-50 duration-200'
          )}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
      
      {/* Indicador de loading */}
      {isLoading && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-muted animate-pulse" />
      )}
    </Button>
  );
}

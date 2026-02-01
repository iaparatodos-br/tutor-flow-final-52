// =====================================================
// TEACHER INBOX - TYPES
// =====================================================

export type NotificationStatus = 'inbox' | 'saved' | 'done';

export type NotificationCategory = 
  | 'pending_past_classes' 
  | 'amnesty_eligible' 
  | 'overdue_invoices' 
  | 'pending_reports';

export type NotificationSourceType = 'class' | 'invoice';

export type UrgencyLevel = 'high' | 'medium' | 'low';

// =====================================================
// NOTIFICATION COUNTS
// =====================================================
export interface NotificationCounts {
  inbox_count: number;
  inbox_unread_count: number;
  saved_count: number;
  done_count: number;
}

// =====================================================
// NOTIFICATION FILTERS
// =====================================================
export interface NotificationFilters {
  status: NotificationStatus;
  isRead?: boolean;
  category?: NotificationCategory;
}

// =====================================================
// TEACHER NOTIFICATION (from RPC)
// =====================================================
export interface TeacherNotification {
  id: string;
  teacher_id: string;
  source_type: NotificationSourceType;
  source_id: string;
  category: NotificationCategory;
  status: NotificationStatus;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  status_changed_at: string | null;
  // Enriched data from JOINs
  class_date: string | null;
  class_status: string | null;
  student_name: string | null;
  student_email: string | null;
  invoice_amount: number | null;
  invoice_due_date: string | null;
  invoice_status: string | null;
  service_name: string | null;
  days_overdue: number;
}

// =====================================================
// CATEGORY CONFIGURATION
// =====================================================
export interface CategoryConfig {
  key: NotificationCategory;
  icon: string;
  colorClass: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
}

export const CATEGORY_CONFIG: Record<NotificationCategory, CategoryConfig> = {
  pending_past_classes: {
    key: 'pending_past_classes',
    icon: 'Clock',
    colorClass: 'text-amber-600',
    badgeVariant: 'secondary',
  },
  amnesty_eligible: {
    key: 'amnesty_eligible',
    icon: 'Gift',
    colorClass: 'text-purple-600',
    badgeVariant: 'outline',
  },
  overdue_invoices: {
    key: 'overdue_invoices',
    icon: 'AlertCircle',
    colorClass: 'text-destructive',
    badgeVariant: 'destructive',
  },
  pending_reports: {
    key: 'pending_reports',
    icon: 'FileText',
    colorClass: 'text-blue-600',
    badgeVariant: 'default',
  },
};

// =====================================================
// URGENCY STYLES
// =====================================================
export const getUrgencyLevel = (notification: TeacherNotification): UrgencyLevel => {
  const { category, days_overdue } = notification;
  
  // Overdue invoices are always high urgency
  if (category === 'overdue_invoices') {
    return 'high';
  }
  
  // Pending past classes: high if > 3 days, medium if > 1 day
  if (category === 'pending_past_classes') {
    if (days_overdue > 3) return 'high';
    if (days_overdue > 1) return 'medium';
    return 'low';
  }
  
  // Amnesty eligible: medium urgency (time-sensitive)
  if (category === 'amnesty_eligible') {
    return 'medium';
  }
  
  // Pending reports: low urgency
  return 'low';
};

export const URGENCY_STYLES: Record<UrgencyLevel, { border: string; bg: string }> = {
  high: {
    border: 'border-l-4 border-l-destructive',
    bg: 'bg-destructive/5',
  },
  medium: {
    border: 'border-l-4 border-l-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
  },
  low: {
    border: 'border-l-4 border-l-muted',
    bg: '',
  },
};

// =====================================================
// READ/UNREAD STYLES
// =====================================================
export const READ_STYLES = {
  read: {
    opacity: 'opacity-60',
    fontWeight: 'font-normal',
  },
  unread: {
    opacity: '',
    fontWeight: 'font-medium',
  },
};

// =====================================================
// DEEP LINK HELPERS
// =====================================================
export const buildNotificationDeepLink = (notification: TeacherNotification): string => {
  const { source_type, source_id, category, class_date } = notification;
  
  if (source_type === 'class') {
    const params = new URLSearchParams();
    
    if (class_date) {
      params.set('date', class_date.split('T')[0]);
    }
    params.set('classId', source_id);
    
    // Add action hint for amnesty
    if (category === 'amnesty_eligible') {
      params.set('action', 'amnesty');
    } else if (category === 'pending_reports') {
      params.set('action', 'report');
    }
    
    return `/agenda?${params.toString()}`;
  }
  
  if (source_type === 'invoice') {
    return `/faturas?highlight=${source_id}`;
  }
  
  return '/inbox';
};

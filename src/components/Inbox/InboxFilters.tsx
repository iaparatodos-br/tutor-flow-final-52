import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { NotificationCategory } from '@/types/inbox';

interface InboxFiltersProps {
  readFilter: 'all' | 'read' | 'unread';
  onReadFilterChange: (filter: 'all' | 'read' | 'unread') => void;
  categoryFilter: NotificationCategory | 'all';
  onCategoryFilterChange: (category: NotificationCategory | 'all') => void;
}

export function InboxFilters({
  readFilter,
  onReadFilterChange,
  categoryFilter,
  onCategoryFilterChange,
}: InboxFiltersProps) {
  const { t } = useTranslation('inbox');

  const readOptions = [
    { value: 'all', label: t('filters.all') },
    { value: 'unread', label: t('filters.unread') },
    { value: 'read', label: t('filters.read') },
  ];

  const categoryOptions: { value: NotificationCategory | 'all'; label: string }[] = [
    { value: 'all', label: t('filters.category.all') },
    { value: 'pending_past_classes', label: t('filters.category.pending_past_classes') },
    { value: 'amnesty_eligible', label: t('filters.category.amnesty_eligible') },
    { value: 'overdue_invoices', label: t('filters.category.overdue_invoices') },
    { value: 'pending_reports', label: t('filters.category.pending_reports') },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Read/Unread Filter - Button Group */}
      <div className="flex rounded-md border">
        {readOptions.map((option) => (
          <Button
            key={option.value}
            variant={readFilter === option.value ? 'secondary' : 'ghost'}
            size="sm"
            className="rounded-none first:rounded-l-md last:rounded-r-md border-0"
            onClick={() => onReadFilterChange(option.value as 'all' | 'read' | 'unread')}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Category Filter - Select */}
      <Select
        value={categoryFilter}
        onValueChange={(v) => onCategoryFilterChange(v as NotificationCategory | 'all')}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={t('filters.category.label')} />
        </SelectTrigger>
        <SelectContent>
          {categoryOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

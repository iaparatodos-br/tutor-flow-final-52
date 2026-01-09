import { Badge } from '@/components/ui/badge';
import { Package, Zap, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface InvoiceTypeBadgeProps {
  invoiceType: string | null | undefined;
}

export function InvoiceTypeBadge({ invoiceType }: InvoiceTypeBadgeProps) {
  const { t } = useTranslation('financial');

  const typeConfig: Record<string, { label: string; icon: typeof Package; className: string }> = {
    monthly_subscription: {
      label: t('invoiceTypes.monthlySubscription'),
      icon: Package,
      className: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700'
    },
    automated: {
      label: t('invoiceTypes.automated'),
      icon: Zap,
      className: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
    },
    manual: {
      label: t('invoiceTypes.manual'),
      icon: FileText,
      className: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-300 dark:border-gray-600'
    }
  };

  const config = typeConfig[invoiceType as keyof typeof typeConfig] || typeConfig.manual;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

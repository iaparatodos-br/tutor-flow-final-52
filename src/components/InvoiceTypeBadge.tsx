import { Badge } from '@/components/ui/badge';
import { Package, Zap, FileText, CreditCard, XCircle, AlertTriangle } from 'lucide-react';
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
    prepaid_class: {
      label: t('invoiceTypes.prepaidClass'),
      icon: CreditCard,
      className: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
    },
    cancellation: {
      label: t('invoiceTypes.cancellation'),
      icon: XCircle,
      className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700'
    },
    orphan_charges: {
      label: t('invoiceTypes.orphanCharges'),
      icon: AlertTriangle,
      className: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700'
    },
    manual: {
      label: t('invoiceTypes.manual'),
      icon: FileText,
      className: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-300 dark:border-gray-600'
    },
    regular: {
      label: t('invoiceTypes.regular'),
      icon: FileText,
      className: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-300 dark:border-gray-600'
    }
  };

  const config = typeConfig[invoiceType as string] || typeConfig.manual;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle, Zap, Package, FileText, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface InvoiceStatusBadgeProps {
  status: 'paid' | 'open' | 'overdue' | 'void' | 'draft' | 'paga' | 'pendente' | 'vencida' | 'cancelada';
  paymentOrigin?: string | null;
  invoiceType?: string | null;
}

export function InvoiceStatusBadge({ status, paymentOrigin, invoiceType }: InvoiceStatusBadgeProps) {
  const { t } = useTranslation('financial');

  const statusMap = {
    paid: { label: t('status.paid'), className: 'bg-success text-success-foreground hover:bg-success/80' },
    paga: { label: t('status.paid'), className: 'bg-success text-success-foreground hover:bg-success/80' },
    open: { label: t('status.pending'), className: 'bg-primary text-primary-foreground hover:bg-primary/80' },
    pendente: { label: t('status.pending'), className: 'bg-primary text-primary-foreground hover:bg-primary/80' },
    overdue: { label: t('status.overdue'), className: 'bg-destructive text-destructive-foreground hover:bg-destructive/80' },
    vencida: { label: t('status.overdue'), className: 'bg-destructive text-destructive-foreground hover:bg-destructive/80' },
    void: { label: t('status.cancelled'), className: 'bg-muted text-muted-foreground hover:bg-muted/80' },
    cancelada: { label: t('status.cancelled'), className: 'bg-muted text-muted-foreground hover:bg-muted/80' },
    draft: { label: t('status.pending'), className: 'bg-warning text-warning-foreground hover:bg-warning/80' },
  };

  const { label, className } = statusMap[status] || statusMap.void;
  
  const isPaid = status === 'paid' || status === 'paga';
  const isManual = paymentOrigin === 'manual';
  const isAutomatic = paymentOrigin === 'automatic';
  const isMonthlySubscription = invoiceType === 'monthly_subscription';

  // Get invoice type icon
  const getTypeIcon = () => {
    if (isMonthlySubscription) return <Package className="h-3 w-3" />;
    if (isPaid && isManual) return <CheckCircle className="h-3 w-3" />;
    if (isPaid && isAutomatic) return <Zap className="h-3 w-3" />;
    return null;
  };

  // Get invoice type suffix
  const getTypeSuffix = () => {
    if (isPaid && isManual) return <span className="text-xs opacity-80">({t('paymentOrigin.manual')})</span>;
    if (isPaid && isAutomatic) return <span className="text-xs opacity-80">({t('paymentOrigin.automatic')})</span>;
    return null;
  };

  return (
    <Badge className={cn('text-white gap-1', className)}>
      {getTypeIcon()}
      {label}
      {getTypeSuffix()}
    </Badge>
  );
}

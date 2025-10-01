import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle, Zap } from 'lucide-react';

interface InvoiceStatusBadgeProps {
  status: 'paid' | 'open' | 'overdue' | 'void' | 'draft' | 'paga' | 'pendente' | 'vencida' | 'cancelada';
  paymentOrigin?: string | null;
}

export function InvoiceStatusBadge({ status, paymentOrigin }: InvoiceStatusBadgeProps) {
  const statusMap = {
    paid: { label: 'Paga', className: 'bg-success text-success-foreground hover:bg-success/80' },
    paga: { label: 'Paga', className: 'bg-success text-success-foreground hover:bg-success/80' },
    open: { label: 'Em Aberto', className: 'bg-primary text-primary-foreground hover:bg-primary/80' },
    pendente: { label: 'Em Aberto', className: 'bg-primary text-primary-foreground hover:bg-primary/80' },
    overdue: { label: 'Vencida', className: 'bg-destructive text-destructive-foreground hover:bg-destructive/80' },
    vencida: { label: 'Vencida', className: 'bg-destructive text-destructive-foreground hover:bg-destructive/80' },
    void: { label: 'Anulada', className: 'bg-muted text-muted-foreground hover:bg-muted/80' },
    cancelada: { label: 'Anulada', className: 'bg-muted text-muted-foreground hover:bg-muted/80' },
    draft: { label: 'Rascunho', className: 'bg-warning text-warning-foreground hover:bg-warning/80' },
  };

  const { label, className } = statusMap[status] || statusMap.void;
  
  const isPaid = status === 'paid' || status === 'paga';
  const isManual = paymentOrigin === 'manual';
  const isAutomatic = paymentOrigin === 'automatic';

  return (
    <Badge className={cn('text-white gap-1', className)}>
      {isPaid && isManual && <CheckCircle className="h-3 w-3" />}
      {isPaid && isAutomatic && <Zap className="h-3 w-3" />}
      {label}
      {isPaid && isManual && <span className="text-xs opacity-80">(Manual)</span>}
      {isPaid && isAutomatic && <span className="text-xs opacity-80">(Auto)</span>}
    </Badge>
  );
}
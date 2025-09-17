import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface InvoiceStatusBadgeProps {
  status: 'paid' | 'open' | 'overdue' | 'void' | 'draft' | 'paga' | 'pendente' | 'vencida' | 'cancelada';
}

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
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

  return <Badge className={cn('text-white', className)}>{label}</Badge>;
}
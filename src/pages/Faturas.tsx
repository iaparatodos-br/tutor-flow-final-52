import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

interface Invoice {
  id: string;
  created_at: string;
  due_date: string;
  amount: number;
  status: 'paid' | 'open' | 'overdue' | 'void' | 'draft' | 'paga' | 'pendente' | 'vencida' | 'cancelada';
  stripe_hosted_invoice_url: string | null;
  description: string | null;
}

const fetchStudentInvoices = async () => {
  // A política de RLS no Supabase garantirá que um aluno logado
  // veja apenas as suas próprias faturas.
  const { data, error } = await supabase
    .from('invoices')
    .select('id, created_at, due_date, amount, status, stripe_hosted_invoice_url, description')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as Invoice[];
};

export default function Faturas() {
  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ['studentInvoices'],
    queryFn: fetchStudentInvoices,
  });

  const handlePayNow = (url: string) => {
    window.open(url, '_blank');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Minhas Faturas</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de Cobranças</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-destructive">Erro ao carregar as faturas.</p>
              </div>
            ) : !invoices || invoices.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Nenhuma fatura encontrada.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        {format(new Date(invoice.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {invoice.description || 'Cobrança de aula'}
                      </TableCell>
                      <TableCell>
                        {invoice.due_date 
                          ? format(new Date(invoice.due_date), 'dd/MM/yyyy', { locale: ptBR }) 
                          : '-'
                        }
                      </TableCell>
                      <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {(invoice.status === 'open' || 
                          invoice.status === 'overdue' || 
                          invoice.status === 'pendente' || 
                          invoice.status === 'vencida') && 
                         invoice.stripe_hosted_invoice_url && (
                          <Button 
                            onClick={() => handlePayNow(invoice.stripe_hosted_invoice_url!)}
                            size="sm"
                          >
                            Pagar Agora
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
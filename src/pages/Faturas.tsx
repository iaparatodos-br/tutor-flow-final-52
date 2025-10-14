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
import { useTeacherContext } from '@/contexts/TeacherContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Invoice {
  id: string;
  created_at: string;
  due_date: string;
  amount: number;
  status: 'paid' | 'open' | 'overdue' | 'void' | 'draft' | 'paga' | 'pendente' | 'vencida' | 'cancelada';
  stripe_hosted_invoice_url: string | null;
  description: string | null;
  payment_origin: string | null;
  manual_payment_notes: string | null;
  payment_intent_cancelled_at: string | null;
  payment_intent_cancelled_by: string | null;
}

const fetchStudentInvoices = async (teacherId: string) => {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, created_at, due_date, amount, status, stripe_hosted_invoice_url, description, teacher_id, payment_origin, manual_payment_notes, payment_intent_cancelled_at, payment_intent_cancelled_by')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as Invoice[];
};

export default function Faturas() {
  const { selectedTeacherId, loading: teacherLoading } = useTeacherContext();
  const navigate = useNavigate();

  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ['studentInvoices', selectedTeacherId],
    queryFn: () => fetchStudentInvoices(selectedTeacherId!),
    enabled: !!selectedTeacherId,
  });

  const handlePayNow = (url: string) => {
    window.open(url, '_blank');
  };

  const handleViewReceipt = (invoiceId: string) => {
    navigate(`/recibo/${invoiceId}`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  };

  // Loading state while teacher context is loading
  if (teacherLoading) {
    return (
      <Layout>
        <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Minhas Faturas</h1>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // No teacher selected
  if (!selectedTeacherId) {
    return (
      <Layout>
        <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Minhas Faturas</h1>
          </div>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Selecione um professor para visualizar suas faturas.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-4 sm:space-y-6">
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
                        <InvoiceStatusBadge status={invoice.status} paymentOrigin={invoice.payment_origin} />
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Faturas pendentes/vencidas: Botão "Pagar Agora" */}
                        {(invoice.status === 'open' || 
                          invoice.status === 'overdue' || 
                          invoice.status === 'pendente' || 
                          invoice.status === 'vencida') && (
                          invoice.stripe_hosted_invoice_url ? (
                            <Button 
                              onClick={() => handlePayNow(invoice.stripe_hosted_invoice_url!)}
                              size="sm"
                            >
                              Pagar Agora
                            </Button>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              URL de pagamento não disponível
                            </div>
                          )
                        )}

                        {/* Faturas pagas: Botão "Ver Recibo" */}
                        {(invoice.status === 'paid' || invoice.status === 'paga') && (
                          <Button 
                            onClick={() => handleViewReceipt(invoice.id)}
                            size="sm"
                            variant="outline"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Ver Recibo
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
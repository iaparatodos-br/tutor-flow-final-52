import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AmnestyButton } from "@/components/AmnestyButton";
import { DollarSign, User, Calendar, CreditCard } from "lucide-react";

interface InvoiceWithStudent {
  id: string;
  amount: number;
  due_date: string;
  status: 'pendente' | 'paga' | 'vencida' | 'cancelada';
  description: string | null;
  invoice_type?: string;
  class_id?: string;
  original_amount?: number;
  student: {
    name: string;
    email: string;
  };
  class?: {
    id: string;
    status: string;
    charge_applied?: boolean;
    amnesty_granted?: boolean;
  };
}

export default function Financeiro() {
  const { profile, isProfessor } = useAuth();
  const { toast } = useToast();
  
  const [invoices, setInvoices] = useState<InvoiceWithStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      loadInvoices();
    }
  }, [profile]);

  const loadInvoices = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          id,
          amount,
          due_date,
          status,
          description,
          invoice_type,
          class_id,
          original_amount,
          profiles!invoices_student_id_fkey (
            name,
            email
          )
        `)
        .eq(isProfessor ? 'teacher_id' : 'student_id', profile.id)
        .order('due_date', { ascending: false });

      if (error) throw error;
      setInvoices((data || []).map((item: any) => ({
        ...item,
        student: item.profiles || { name: 'N/A', email: 'N/A' }
      })) as InvoiceWithStudent[]);
    } catch (error) {
      console.error('Erro ao carregar faturas:', error);
      toast({
        title: "Erro ao carregar faturas",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (invoiceId: string) => {
    // Para MVP, simular pagamento atualizando status
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'paga' })
        .eq('id', invoiceId);

      if (error) throw error;

      toast({
        title: "Pagamento processado!",
        description: "A fatura foi marcada como paga",
      });
      
      loadInvoices();
    } catch (error: any) {
      console.error('Erro ao processar pagamento:', error);
      toast({
        title: "Erro ao processar pagamento",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pendente: { label: "Pendente", variant: "secondary" as const },
      paga: { label: "Paga", variant: "default" as const },
      vencida: { label: "Vencida", variant: "destructive" as const },
      cancelada: { label: "Cancelada", variant: "outline" as const }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendente;
    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const totalPendente = invoices
    .filter(invoice => invoice.status === 'pendente')
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);

  const totalPago = invoices
    .filter(invoice => invoice.status === 'paga')
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">
            {isProfessor ? "Gestão Financeira" : "Minhas Faturas"}
          </h1>
          <p className="text-muted-foreground">
            {isProfessor 
              ? "Acompanhe seus recebimentos e faturas"
              : "Veja suas faturas e faça pagamentos"
            }
          </p>
        </div>

        {/* Summary Cards */}
        {isProfessor && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pendente</CardTitle>
                <DollarSign className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalPendente)}</div>
                <p className="text-xs text-muted-foreground">
                  A receber
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Recebido</CardTitle>
                <DollarSign className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalPago)}</div>
                <p className="text-xs text-muted-foreground">
                  Já recebido
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Invoices List */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {isProfessor ? "Faturas Emitidas" : "Suas Faturas"} ({invoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
                <p className="text-muted-foreground">Carregando faturas...</p>
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Nenhuma fatura encontrada</h3>
                <p className="text-muted-foreground">
                  {isProfessor 
                    ? "Suas faturas aparecerão aqui quando criadas"
                    : "Você não possui faturas no momento"
                  }
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {isProfessor ? "Aluno" : "Professor"}
                    </TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{invoice.student?.name}</p>
                            <p className="text-sm text-muted-foreground">{invoice.student?.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{invoice.description || "Aulas particulares"}</p>
                          {invoice.original_amount && invoice.original_amount !== invoice.amount && (
                            <p className="text-xs text-muted-foreground">
                              Valor original: {formatCurrency(Number(invoice.original_amount))}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={invoice.invoice_type === 'cancellation' ? 'destructive' : 'default'}>
                          {invoice.invoice_type === 'cancellation' ? 'Cancelamento' : 'Regular'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold">
                        {formatCurrency(Number(invoice.amount))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {formatDate(invoice.due_date)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(invoice.status)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {/* Payment button for students */}
                          {!isProfessor && invoice.status === 'pendente' && (
                            <Button
                              size="sm"
                              onClick={() => handlePayment(invoice.id)}
                              className="bg-gradient-success shadow-success hover:bg-success"
                            >
                              <CreditCard className="h-4 w-4 mr-1" />
                              Pagar
                            </Button>
                          )}
                          
                          {/* Amnesty button for professors on cancellation invoices */}
                          {isProfessor && 
                           invoice.invoice_type === 'cancellation' && 
                           invoice.class?.charge_applied && 
                           !invoice.class?.amnesty_granted &&
                           invoice.status === 'pendente' && (
                            <AmnestyButton
                              classId={invoice.class_id!}
                              studentName={invoice.student.name}
                              onAmnestyGranted={loadInvoices}
                            />
                          )}
                        </div>
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
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useProfile } from "@/contexts/ProfileContext";
import { useTeacherContext } from "@/contexts/TeacherContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Layout } from "@/components/Layout";
import { StripeAccountGuard } from "@/components/StripeAccountGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AmnestyButton } from "@/components/AmnestyButton";
import { ExpenseList } from "@/components/ExpenseList";
import { PaymentOptionsCard } from "@/components/PaymentOptionsCard";
import { ArchivedDataViewer } from "@/components/ArchivedDataViewer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FeatureGate } from "@/components/FeatureGate";
import { CreateInvoiceModal } from "@/components/CreateInvoiceModal";
import { BusinessProfilesManager } from "@/components/BusinessProfilesManager";
import { DollarSign, User, Calendar, CreditCard, Receipt, TrendingUp, CheckCircle, AlertTriangle, AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTranslation } from "react-i18next";
import { parseISO } from "date-fns";
import { todayDateString, startOfMonthTz, DEFAULT_TIMEZONE } from "@/utils/timezone";

// Helper function to get invoice type badge - DRY principle
const getInvoiceTypeBadge = (invoiceType: string | undefined, t: (key: string) => string) => {
  switch (invoiceType) {
    case 'monthly_subscription':
      return <Badge variant="default">{t('financial:invoiceTypes.monthlySubscription')}</Badge>;
    case 'automated':
      return <Badge variant="secondary">{t('financial:invoiceTypes.automated')}</Badge>;
    case 'manual':
      return <Badge variant="outline">{t('financial:invoiceTypes.manual')}</Badge>;
    case 'cancellation':
      return <Badge variant="destructive">{t('financial:invoiceTypes.cancellation')}</Badge>;
    case 'orphan_charges':
      return <Badge className="bg-warning text-warning-foreground">{t('financial:invoiceTypes.orphanCharges')}</Badge>;
    case 'prepaid_class':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">{t('financial:invoiceTypes.prepaidClass')}</Badge>;
    default:
      return <Badge variant="outline">{t('financial:invoiceTypes.regular')}</Badge>;
  }
};

interface InvoiceWithStudent {
  id: string;
  amount: number;
  due_date: string;
  status: 'open' | 'paid' | 'overdue' | 'void' | 'pendente' | 'paga' | 'vencida' | 'cancelada';
  description: string | null;
  invoice_type?: string;
  class_id?: string;
  original_amount?: number;
  boleto_url?: string;
  linha_digitavel?: string;
  stripe_payment_intent_id?: string;
  monthly_subscription_id?: string;
  monthly_subscription?: {
    name: string;
  };
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

interface ExpenseSummary {
  total: number;
  count: number;
}

export default function Financeiro() {
  const { t } = useTranslation('financial');
  const {
    profile,
    isProfessor,
    isAluno
  } = useProfile();
  const {
    selectedTeacherId
  } = useTeacherContext();
  const {
    toast
  } = useToast();
  const [invoices, setInvoices] = useState<InvoiceWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary>({
    total: 0,
    count: 0
  });
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithStudent | null>(null);
  const [students, setStudents] = useState<{
    id: string;
    name: string;
    email: string;
  }[]>([]);
  const [dependents, setDependents] = useState<{
    id: string;
    name: string;
    responsible_id: string;
    responsible_name: string;
  }[]>([]);
  const [markAsPaidDialogOpen, setMarkAsPaidDialogOpen] = useState(false);
  const [invoiceToMarkPaid, setInvoiceToMarkPaid] = useState<string | null>(null);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [showFeeAlert, setShowFeeAlert] = useState(true);
  
  const userTimezone = profile?.timezone || DEFAULT_TIMEZONE;
  
  // Deep-linking support
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  // Process highlight parameter from URL
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (highlightId) {
      setHighlightedInvoiceId(highlightId);
      searchParams.delete('highlight');
      setSearchParams(searchParams, { replace: true });
      setTimeout(() => {
        setHighlightedInvoiceId(null);
      }, 3000);
    }
  }, [searchParams, setSearchParams]);

  // Scroll to highlighted invoice
  useEffect(() => {
    if (highlightedInvoiceId && highlightedRowRef.current && !loading) {
      highlightedRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [highlightedInvoiceId, loading]);

  // Verifica se a fatura está vencida (due_date é campo date-only YYYY-MM-DD)
  const isOverdue = (dueDate: string, status: string): boolean => {
    if (['paga', 'paid', 'void', 'cancelada'].includes(status)) {
      return false;
    }
    // Comparação segura de campos date-only: string vs string
    const todayStr = todayDateString(userTimezone);
    return dueDate < todayStr;
  };

  useEffect(() => {
    if (profile?.id) {
      loadInvoices();
      if (isProfessor) {
        loadExpenseSummary();
        loadStudents();
        loadDependents();
      }
    }
  }, [profile, isProfessor]);

  useEffect(() => {
    if (isAluno && selectedTeacherId && profile?.id) {
      loadInvoices();
    }
  }, [selectedTeacherId, isAluno]);

  const loadStudents = async () => {
    if (!profile?.id) return;
    try {
      const {
        data,
        error
      } = await supabase.rpc('get_teacher_students', {
        teacher_user_id: profile.id
      });
      if (error) throw error;
      const transformedData = data?.map((student: any) => ({
        id: student.student_id,
        name: student.student_name,
        email: student.student_email
      })) || [];
      setStudents(transformedData);
    } catch (error) {
      console.error('Error loading students:', error);
    }
  };
  
  const loadDependents = async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase.rpc('get_teacher_dependents', {
        p_teacher_id: profile.id
      });
      if (error) {
        console.error('Error loading dependents:', error);
        return;
      }
      const transformedData = (data || []).map((d: any) => ({
        id: d.dependent_id,
        name: d.dependent_name,
        responsible_id: d.responsible_id,
        responsible_name: d.responsible_name
      }));
      setDependents(transformedData);
    } catch (error) {
      console.error('Error loading dependents:', error);
    }
  };

  const loadExpenseSummary = async () => {
    try {
      // Usar startOfMonthTz para calcular limites do mês no fuso do utilizador
      const now = new Date();
      const monthStart = startOfMonthTz(now, userTimezone);
      const nextMonthStart = startOfMonthTz(
        new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1),
        userTimezone
      );
      // expense_date é date-only, usar formato YYYY-MM-DD
      const startStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-01`;
      const endStr = `${nextMonthStart.getFullYear()}-${String(nextMonthStart.getMonth() + 1).padStart(2, '0')}-01`;
      
      const {
        data,
        error
      } = await supabase.from('expenses').select('amount').eq('teacher_id', profile!.id).gte('expense_date', startStr).lt('expense_date', endStr);
      if (error) throw error;
      const total = data?.reduce((sum, expense) => sum + Number(expense.amount), 0) || 0;
      setExpenseSummary({
        total,
        count: data?.length || 0
      });
    } catch (error) {
      console.error('Error loading expense summary:', error);
    }
  };

  const loadInvoices = async () => {
    if (!profile?.id) return;
    try {
      let query = supabase.from('invoices').select(`
          id,
          amount,
          due_date,
          status,
          description,
          invoice_type,
          class_id,
          student_id,
          original_amount,
          boleto_url,
          linha_digitavel,
          stripe_payment_intent_id,
          classes!invoices_class_id_fkey (
            id,
            status,
            charge_applied,
            amnesty_granted,
            is_group_class
          ),
          profiles!invoices_student_id_fkey (
            name,
            email
          )
        `);
      if (isProfessor) {
        query = query.eq('teacher_id', profile.id);
      } else {
        query = query.eq('student_id', profile.id);
        if (selectedTeacherId) {
          query = query.eq('teacher_id', selectedTeacherId);
        }
      }
      const {
        data,
        error
      } = await query.order('created_at', {
        ascending: false
      });
      if (error) throw error;
      setInvoices((data || []).map((item: any) => ({
        ...item,
        student: item.profiles || {
          name: 'N/A',
          email: 'N/A'
        }
      })) as InvoiceWithStudent[]);
    } catch (error) {
      console.error('Erro ao carregar faturas:', error);
      toast({
        title: "Erro ao carregar faturas",
        description: "Tente novamente mais tarde",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const openPayment = (invoice: InvoiceWithStudent) => {
    setSelectedInvoice(invoice);
    setPaymentDialogOpen(true);
  };
  const openMarkAsPaidDialog = (invoiceId: string) => {
    setInvoiceToMarkPaid(invoiceId);
    setPaymentNotes('');
    setMarkAsPaidDialogOpen(true);
  };

  const handleMarkAsPaid = async () => {
    if (!invoiceToMarkPaid) return;
    setIsMarkingPaid(true);
    try {
      const {
        data,
        error: functionError
      } = await supabase.functions.invoke('cancel-payment-intent', {
        body: {
          invoice_id: invoiceToMarkPaid,
          notes: paymentNotes || undefined
        }
      });
      if (functionError) {
        console.error('Edge function error:', functionError);
        throw new Error(functionError.message || 'Failed to cancel payment intent');
      }
      if (!data?.success) {
        throw new Error(data?.details || 'Failed to process payment cancellation');
      }
      toast({
        title: "Fatura marcada como paga",
        description: data.payment_intent_cancelled ? "O boleto foi cancelado no Stripe e a fatura marcada como paga." : "A fatura foi marcada como paga com sucesso."
      });
      setMarkAsPaidDialogOpen(false);
      setInvoiceToMarkPaid(null);
      setPaymentNotes('');
      loadInvoices();
    } catch (error: any) {
      console.error('Erro ao marcar fatura como paga:', error);
      toast({
        title: "Erro ao marcar fatura como paga",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pendente: { label: "Pendente", variant: "secondary" as const },
      open: { label: "Em Aberto", variant: "secondary" as const },
      paga: { label: "Paga", variant: "default" as const },
      paid: { label: "Paga", variant: "default" as const },
      vencida: { label: "Vencida", variant: "destructive" as const },
      overdue: { label: "Vencida", variant: "destructive" as const },
      cancelada: { label: "Cancelada", variant: "outline" as const },
      void: { label: "Cancelada", variant: "outline" as const }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendente;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount);
  };

  /**
   * Formata um campo date-only (YYYY-MM-DD) para exibição dd/MM/yyyy.
   * REGRA v3.6: NUNCA usar timeZone para campos date-only — parseISO é seguro.
   */
  const formatDate = (dateString: string) => {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateString;
  };

  const totalPendente = invoices.filter(invoice => ['pendente', 'open', 'overdue', 'vencida'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const paidInvoices = invoices.filter(invoice => ['paga', 'paid'].includes(invoice.status));
  const totalPago = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const netProfit = isProfessor ? totalPago - expenseSummary.total : 0;

  return <Layout>
      <div className="max-w-6xl mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">
              {isProfessor ? "Gestão Financeira" : "Minhas Faturas"}
            </h1>
            <p className="text-muted-foreground">
              {isProfessor ? "Acompanhe seus recebimentos, despesas e lucro" : "Veja suas faturas e faça pagamentos"}
            </p>
          </div>
          {isProfessor && <ArchivedDataViewer />}
        </div>

        <FeatureGate feature="financial_module">
            <div className="space-y-6">

        {/* Fee Transparency Alert - Only for Professors */}
        {isProfessor && showFeeAlert && (
          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 relative">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-900 dark:text-blue-100 pr-8">
              Transparência de Taxas Stripe
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-2 h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900"
                onClick={() => setShowFeeAlert(false)}
              >
                <X className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </Button>
            </AlertTitle>
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              <p className="mb-2">
                Os boletos gerados possuem uma taxa fixa do Stripe de <strong>R$ 3,49</strong> por transação.
                Esta taxa é deduzida automaticamente e já está refletida nos valores que você receberá.
              </p>
              <div className="bg-white dark:bg-gray-900 p-3 rounded-md text-sm border border-blue-100 dark:border-blue-900">
                <p className="font-medium mb-1 text-blue-900 dark:text-blue-100">Exemplo de cálculo:</p>
                <p className="text-blue-800 dark:text-blue-300">• Valor cobrado do aluno: R$ 100,00</p>
                <p className="text-blue-800 dark:text-blue-300">• Taxa Stripe (boleto): -R$ 3,49</p>
                <p className="font-bold text-green-600 dark:text-green-400">• Você receberá: R$ 96,51</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        {isProfessor && <div className="grid gap-4 md:grid-cols-4">
            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Receitas Pendentes</CardTitle>
                <TrendingUp className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalPendente)}</div>
                <p className="text-xs text-muted-foreground">
                  Aguardando pagamento
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Receitas Recebidas</CardTitle>
                <TrendingUp className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(totalPago)}</div>
                <p className="text-xs text-muted-foreground">
                  Este mês
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Despesas</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatCurrency(expenseSummary.total)}</div>
                <p className="text-xs text-muted-foreground">
                  {expenseSummary.count} despesas este mês
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lucro Líquido</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(netProfit)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Receitas - Despesas
                </p>
              </CardContent>
            </Card>
          </div>}

        {/* Tabs for professors, single view for students */}
        {isProfessor ? <Tabs defaultValue="receitas" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="receitas">Receitas</TabsTrigger>
              <TabsTrigger value="despesas">Despesas</TabsTrigger>
              <TabsTrigger value="contas">{t('paymentAccounts')}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="receitas" className="space-y-4">
              <StripeAccountGuard>
              <Card className="shadow-card">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Faturas Emitidas ({invoices.length})
                    </CardTitle>
            {students.filter(s => {
                        return true;
                      }).length > 0 && <CreateInvoiceModal students={students} dependents={dependents} onInvoiceCreated={loadInvoices} />}
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? <div className="text-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Carregando faturas...</p>
                    </div> : invoices.length === 0 ? <div className="text-center py-8">
                      <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium mb-2">Nenhuma fatura encontrada</h3>
                      <p className="text-muted-foreground">
                        Suas faturas aparecerão aqui quando criadas
                      </p>
                    </div> : <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Aluno</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map(invoice => <TableRow 
                            key={invoice.id}
                            ref={invoice.id === highlightedInvoiceId ? highlightedRowRef : null}
                            className={cn(
                              invoice.id === highlightedInvoiceId && "ring-2 ring-primary animate-pulse bg-primary/5"
                            )}
                          >
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
                                <p>{invoice.description || t('defaultDescription')}</p>
                                {invoice.original_amount && invoice.original_amount !== invoice.amount && <p className="text-xs text-muted-foreground">
                                    {t('originalAmount', { amount: formatCurrency(Number(invoice.original_amount)) })}
                                  </p>}
                              </div>
                            </TableCell>
                            <TableCell>
                              {getInvoiceTypeBadge(invoice.invoice_type, t)}
                            </TableCell>
                            <TableCell className="font-bold">
                              {formatCurrency(Number(invoice.amount))}
                            </TableCell>
                            <TableCell>
                              <div className={`flex items-center gap-2 ${
                                isOverdue(invoice.due_date, invoice.status) 
                                  ? 'text-destructive font-semibold' 
                                  : ''
                              }`}>
                                <Calendar className={`h-4 w-4 ${
                                  isOverdue(invoice.due_date, invoice.status)
                                    ? 'text-destructive'
                                    : 'text-muted-foreground'
                                }`} />
                                {formatDate(invoice.due_date)}
                              </div>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(invoice.status)}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {invoice.invoice_type === 'cancellation' && invoice.class?.charge_applied && !invoice.class?.amnesty_granted && ['pendente', 'open'].includes(invoice.status) && <AmnestyButton classId={invoice.class_id!} studentName={invoice.student.name} onAmnestyGranted={loadInvoices} />}
                                
                                {['pendente', 'open', 'overdue', 'vencida'].includes(invoice.status) && <AlertDialog>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <AlertDialogTrigger asChild>
                                              <Button variant="ghost" className="h-8 w-8 p-0">
                                                <CheckCircle className="h-4 w-4" />
                                              </Button>
                                            </AlertDialogTrigger>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Marcar como Paga</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Confirmar Pagamento</AlertDialogTitle>
                                            <AlertDialogDescription asChild>
                                              <div className="space-y-4">
                                                <Alert variant="destructive">
                                                  <AlertTriangle className="h-4 w-4" />
                                                  <AlertTitle>Atenção: Boleto continuará ativo</AlertTitle>
                                                  <AlertDescription>
                                                    <strong>Importante:</strong> Se esta fatura foi gerada com boleto, ele continuará ativo e poderá ser pago pelo aluno.
                                                    O sistema não consegue cancelar boletos já emitidos na Stripe.
                                                    <br /><br />
                                                    <strong>Recomendação:</strong> Notifique o aluno imediatamente para NÃO efetuar o pagamento do boleto, 
                                                    evitando assim pagamento duplicado.
                                                  </AlertDescription>
                                                </Alert>
                                              </div>
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => openMarkAsPaidDialog(invoice.id)}>
                                              Confirmar
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                  </AlertDialog>}
                              </div>
                            </TableCell>
                          </TableRow>)}
                      </TableBody>
                    </Table>}
                </CardContent>
              </Card>
            </StripeAccountGuard>
            </TabsContent>
            
            <TabsContent value="despesas" className="space-y-4">
              <ExpenseList onExpensesChanged={loadExpenseSummary} />
            </TabsContent>

            <TabsContent value="contas" className="space-y-4">
              <BusinessProfilesManager />
            </TabsContent>
          </Tabs> : <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Suas Faturas ({invoices.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <div className="text-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Carregando faturas...</p>
                </div> : invoices.length === 0 ? <div className="text-center py-8">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma fatura encontrada</h3>
                  <p className="text-muted-foreground">
                    Você não possui faturas no momento
                  </p>
                </div> : <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Professor</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map(invoice => <TableRow key={invoice.id}>
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
                            <p>{invoice.description || t('defaultDescription')}</p>
                            {invoice.original_amount && invoice.original_amount !== invoice.amount && <p className="text-xs text-muted-foreground">
                                {t('originalAmount', { amount: formatCurrency(Number(invoice.original_amount)) })}
                              </p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getInvoiceTypeBadge(invoice.invoice_type, t)}
                        </TableCell>
                        <TableCell className="font-bold">
                          {formatCurrency(Number(invoice.amount))}
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-2 ${
                            isOverdue(invoice.due_date, invoice.status) 
                              ? 'text-destructive font-semibold' 
                              : ''
                          }`}>
                            <Calendar className={`h-4 w-4 ${
                              isOverdue(invoice.due_date, invoice.status)
                                ? 'text-destructive'
                                : 'text-muted-foreground'
                            }`} />
                            {formatDate(invoice.due_date)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(invoice.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {invoice.status === 'pendente' && <Button size="sm" onClick={() => openPayment(invoice)} className="bg-gradient-success shadow-success hover:bg-success">
                                <CreditCard className="h-4 w-4 mr-1" />
                                Pagar
                              </Button>}
                          </div>
                        </TableCell>
                      </TableRow>)}
                  </TableBody>
                </Table>}
            </CardContent>
          </Card>}

        <Dialog open={paymentDialogOpen} onOpenChange={open => {
              setPaymentDialogOpen(open);
              if (!open) setSelectedInvoice(null);
            }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pagamento da Fatura</DialogTitle>
            </DialogHeader>
            {selectedInvoice && <PaymentOptionsCard invoice={{
                  id: selectedInvoice.id,
                  amount: String(selectedInvoice.amount),
                  due_date: selectedInvoice.due_date,
                  description: selectedInvoice.description || "Fatura",
                  status: selectedInvoice.status,
                  boleto_url: selectedInvoice.boleto_url,
                  linha_digitavel: selectedInvoice.linha_digitavel,
                  stripe_payment_intent_id: selectedInvoice.stripe_payment_intent_id
                }} onPaymentSuccess={() => {
                  setPaymentDialogOpen(false);
                  setSelectedInvoice(null);
                  loadInvoices();
                }} />}
          </DialogContent>
        </Dialog>

        {/* Mark as Paid Dialog with Notes */}
        <Dialog open={markAsPaidDialogOpen} onOpenChange={setMarkAsPaidDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Pagamento Manual</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ao confirmar, esta fatura será marcada como paga manualmente em nosso sistema.
              </p>
              <div className="space-y-2">
                <label htmlFor="payment-notes" className="text-sm font-medium">
                  Observações (opcional)
                </label>
                <Textarea
                  id="payment-notes"
                  placeholder="Ex: Pagamento recebido via Pix em 15/03..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setMarkAsPaidDialogOpen(false)} disabled={isMarkingPaid}>
                Cancelar
              </Button>
              <Button onClick={handleMarkAsPaid} disabled={isMarkingPaid}>
                {isMarkingPaid ? "Processando..." : "Confirmar Pagamento"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

            </div>
        </FeatureGate>
      </div>
    </Layout>;
}

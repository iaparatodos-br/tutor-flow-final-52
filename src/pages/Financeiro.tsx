import { useEffect, useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { useTeacherContext } from "@/contexts/TeacherContext";
import { supabase } from "@/integrations/supabase/client";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FeatureGate } from "@/components/FeatureGate";
import { CreateInvoiceModal } from "@/components/CreateInvoiceModal";
import { DollarSign, User, Calendar, CreditCard, Receipt, TrendingUp, MoreHorizontal, CheckCircle, AlertTriangle, AlertCircle, X, QrCode, TrendingDown, Settings } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTranslation } from "react-i18next";

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
  pix_qr_code?: string;
  pix_copy_paste?: string;
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
  const [invoiceDetailsOpen, setInvoiceDetailsOpen] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Verifica se a fatura está vencida
  const isOverdue = (dueDate: string, status: string): boolean => {
    // Não considerar vencida se já foi paga ou cancelada
    if (['paga', 'paid', 'void', 'cancelada'].includes(status)) {
      return false;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zerar horas para comparar apenas datas
    
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    
    return due < today;
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

  // Reload invoices when selectedTeacherId changes (for students)
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
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      const {
        data,
        error
      } = await supabase.from('expenses').select('amount').eq('teacher_id', profile!.id).gte('expense_date', currentMonth + '-01').lt('expense_date', new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10));
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
          original_amount,
          boleto_url,
          linha_digitavel,
          pix_qr_code,
          pix_copy_paste,
          stripe_payment_intent_id,
          profiles!invoices_student_id_fkey (
            name,
            email
          )
        `);
      if (isProfessor) {
        query = query.eq('teacher_id', profile.id);
      } else {
        query = query.eq('student_id', profile.id);
        // Filter by selected teacher if specified
        if (selectedTeacherId) {
          query = query.eq('teacher_id', selectedTeacherId);
        }
      }
      const {
        data,
        error
      } = await query.order('due_date', {
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

  const loadInvoiceDetails = async (invoice: InvoiceWithStudent) => {
    // Validação básica de entrada
    if (!invoice?.id) {
      toast({
        title: "Erro",
        description: "Fatura inválida",
        variant: "destructive"
      });
      return;
    }

    setSelectedInvoice(invoice);
    setLoadingDetails(true);
    setInvoiceDetailsOpen(true);
    
    try {
      const { data, error } = await supabase
        .from('invoice_classes')
        .select(`
          id,
          item_type,
          amount,
          description,
          charge_percentage,
          classes (
            id,
            class_date,
            duration_minutes
          ),
          class_participants (
            profiles (name)
          )
        `)
        .eq('invoice_id', invoice.id)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Supabase error loading invoice details:', error);
        throw error;
      }
      
      // Se não retornou dados, pode ser por falta de permissão (RLS) ou fatura sem itens
      if (!data || data.length === 0) {
        console.warn('No invoice items found - this could be due to RLS restrictions or empty invoice');
      }
      
      setInvoiceItems(data || []);
    } catch (error) {
      console.error('Error loading invoice details:', error);
      toast({
        title: "Erro ao carregar detalhes",
        description: error instanceof Error ? error.message : "Não foi possível carregar os detalhes da fatura",
        variant: "destructive"
      });
      setInvoiceItems([]);
    } finally {
      setLoadingDetails(false);
    }
  };
  const handleMarkAsPaid = async () => {
    if (!invoiceToMarkPaid) return;
    setIsMarkingPaid(true);
    try {
      // Call edge function to cancel payment intent on Stripe
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
      pendente: {
        label: "Pendente",
        variant: "secondary" as const
      },
      open: {
        label: "Em Aberto",
        variant: "secondary" as const
      },
      paga: {
        label: "Paga",
        variant: "default" as const
      },
      paid: {
        label: "Paga",
        variant: "default" as const
      },
      vencida: {
        label: "Vencida",
        variant: "destructive" as const
      },
      overdue: {
        label: "Vencida",
        variant: "destructive" as const
      },
      cancelada: {
        label: "Cancelada",
        variant: "outline" as const
      },
      void: {
        label: "Cancelada",
        variant: "outline" as const
      }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendente;
    return <Badge variant={config.variant}>
        {config.label}
      </Badge>;
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
  const totalPendente = invoices.filter(invoice => ['pendente', 'open', 'overdue', 'vencida'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const paidInvoices = invoices.filter(invoice => ['paga', 'paid'].includes(invoice.status));
  const totalPago = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const stripeFees = paidInvoices.length * 3.49; // Taxa fixa do Stripe por boleto

  // Calculate net profit (only for professors): Revenue - Stripe Fees - Expenses
  const netProfit = isProfessor ? totalPago - stripeFees - expenseSummary.total : 0;
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
          <StripeAccountGuard requireChargesEnabled={true}>
            <div className="space-y-6">

        {/* Fee Transparency Alert - Only for Professors */}
        {isProfessor && showFeeAlert && (
          <Alert className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-blue-950 border-green-200 dark:border-green-800 relative">
            <TrendingDown className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertTitle className="text-green-900 dark:text-green-100 pr-8">
              {t('fees.compareTitle')}
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-2 h-6 w-6 p-0 hover:bg-green-100 dark:hover:bg-green-900"
                onClick={() => setShowFeeAlert(false)}
              >
                <X className="h-4 w-4 text-green-600 dark:text-green-400" />
              </Button>
            </AlertTitle>
            <AlertDescription className="text-green-800 dark:text-green-200">
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                {/* PIX - Recomendado */}
                <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-md border border-green-300 dark:border-green-700">
                  <div className="flex items-center gap-2 mb-2">
                    <QrCode className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="font-semibold text-green-800 dark:text-green-200">{t('fees.pixRecommended')}</span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300"><strong>{t('fees.pixFee')}</strong></p>
                  <p className="text-xs text-green-600 dark:text-green-400">{t('fees.pixExample')}</p>
                </div>
                
                {/* Boleto */}
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-300 dark:border-gray-600">
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{t('fees.boletoLabel')}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300"><strong>{t('fees.boletoFeeFixed')}</strong></p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('fees.boletoDescription')}</p>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-900 p-3 rounded-md border border-green-200 dark:border-green-800">
                <p className="font-medium text-green-700 dark:text-green-300">
                  {t('fees.exampleWith34Students', { students: 34, amount: 100 })}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                  <p className="text-gray-700 dark:text-gray-300">
                    • <span className="text-red-600 dark:text-red-400 font-medium">{t('fees.boletoCalculation', { students: 34, total: '118,66' })}</span>
                  </p>
                  <p className="text-gray-700 dark:text-gray-300">
                    • <span className="text-green-600 dark:text-green-400 font-medium">{t('fees.pixCalculation', { students: 34, total: '40,46' })}</span>
                  </p>
                </div>
                <p className="font-bold text-green-600 dark:text-green-400 mt-2">
                  {t('fees.savingsAmount', { amount: '78,20', percentage: 66 })}
                </p>
              </div>
              
              <Button variant="link" className="p-0 h-auto mt-2 text-green-700 dark:text-green-300" asChild>
                <a href="/configuracoes?tab=billing" className="flex items-center gap-1">
                  <Settings className="h-3 w-3" />
                  {t('fees.changeDefaultLink')}
                </a>
              </Button>
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
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="receitas">Receitas</TabsTrigger>
              <TabsTrigger value="despesas">Despesas</TabsTrigger>
            </TabsList>
            
            <TabsContent value="receitas" className="space-y-4">
              <Card className="shadow-card">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Faturas Emitidas ({invoices.length})
                    </CardTitle>
            {students.filter(s => {
                        // Find the full student data to check business_profile_id
                        const fullStudent = invoices.find(inv => inv.student?.email === s.email)?.student;
                        // For now, allow all students - we'll validate in the modal/function
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
                                {/* Amnesty button for professors on cancellation invoices */}
                                {invoice.invoice_type === 'cancellation' && invoice.class?.charge_applied && !invoice.class?.amnesty_granted && ['pendente', 'open'].includes(invoice.status) && <AmnestyButton classId={invoice.class_id!} studentName={invoice.student.name} onAmnestyGranted={loadInvoices} />}
                                
                                {/* Mark as Paid button for unpaid invoices */}
                                {['pendente', 'open', 'overdue', 'vencida'].includes(invoice.status) && <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" className="h-8 w-8 p-0">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => loadInvoiceDetails(invoice)}>
                                        <Receipt className="mr-2 h-4 w-4" />
                                        Ver Detalhes
                                      </DropdownMenuItem>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <DropdownMenuItem onSelect={e => e.preventDefault()}>
                                            <CheckCircle className="mr-2 h-4 w-4" />
                                            Marcar como Paga
                                          </DropdownMenuItem>
                                        </AlertDialogTrigger>
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
                                      </AlertDialog>
                                    </DropdownMenuContent>
                                  </DropdownMenu>}
                              </div>
                            </TableCell>
                          </TableRow>)}
                      </TableBody>
                    </Table>}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="despesas" className="space-y-4">
              <ExpenseList />
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
                            {/* Payment button for students */}
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
                  pix_qr_code: selectedInvoice.pix_qr_code,
                  pix_copy_paste: selectedInvoice.pix_copy_paste,
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
                <Textarea id="payment-notes" placeholder="Ex: Pagamento recebido via PIX, Transferência bancária confirmada, etc." value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} rows={3} disabled={isMarkingPaid} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMarkAsPaidDialogOpen(false)} disabled={isMarkingPaid}>
                  Cancelar
                </Button>
                <Button onClick={handleMarkAsPaid} disabled={isMarkingPaid}>
                  {isMarkingPaid ? <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2"></div>
                      Processando...
                    </> : <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Confirmar Pagamento
                    </>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Invoice Details Modal */}
        <Dialog open={invoiceDetailsOpen} onOpenChange={setInvoiceDetailsOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da Fatura</DialogTitle>
            </DialogHeader>
            
            {selectedInvoice && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">Aluno</p>
                      <p className="font-medium">{selectedInvoice.student.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Vencimento</p>
                      <p className="font-medium">{formatDate(selectedInvoice.due_date)}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      {getStatusBadge(selectedInvoice.status)}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total</p>
                      <p className="font-bold text-lg">{formatCurrency(selectedInvoice.amount)}</p>
                    </div>
                  </div>
                </div>

                {loadingDetails ? (
                  <div className="text-center py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Carregando detalhes...</p>
                  </div>
                ) : invoiceItems.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium mb-2">Nenhum detalhe disponível</h3>
                    <p className="text-muted-foreground text-sm">
                      Esta fatura foi criada antes da implementação do rastreamento detalhado.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground">Itens da Fatura</h3>
                    {invoiceItems.map((item) => (
                      <Card key={item.id}>
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <Badge variant={item.item_type === 'completed_class' ? 'default' : 'secondary'} className="mb-2">
                                {item.item_type === 'completed_class' ? 'Aula Concluída' : 'Cancelamento'}
                              </Badge>
                              <p className="text-sm mb-1">{item.description}</p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(item.classes.class_date).toLocaleDateString('pt-BR')}
                                </span>
                                <span>{item.classes.duration_minutes} min</span>
                              </div>
                              {item.charge_percentage && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Cobrança de {item.charge_percentage}%
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">
                                {formatCurrency(item.amount)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    
                    <div className="pt-4 border-t">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-lg">Total</span>
                        <span className="font-bold text-lg">{formatCurrency(selectedInvoice.amount)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
            </div>
          </StripeAccountGuard>
        </FeatureGate>
      </div>
    </Layout>;
}
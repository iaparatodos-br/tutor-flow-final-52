import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarDays, CreditCard, Settings, RefreshCw, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubscriptionCancellationModal } from '@/components/SubscriptionCancellationModal';
interface Invoice {
  id: string;
  number: string | null;
  status: string;
  amount_paid: number;
  currency: string;
  created: number;
  hosted_invoice_url: string | null;
}
export default function Subscription() {
  const {
    currentPlan,
    subscription,
    refreshSubscription,
    cancelSubscription,
    loading
  } = useSubscription();
  const {
    signOut
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const loadInvoices = async () => {
    setInvoicesLoading(true);
    setInvoicesError(null);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('list-subscription-invoices');
      if (error) {
        // Check if it's an authentication error
        if (error.status === 401 || error.context && error.context.code === 'INVALID_SESSION') {
          console.warn('Session expired, redirecting to login');
          await signOut();
          return;
        }
        throw error;
      }
      setInvoices(data?.invoices || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
      setInvoicesError('Não foi possível carregar o histórico de faturas.');
    } finally {
      setInvoicesLoading(false);
    }
  };
  const handleRefresh = async () => {
    try {
      await refreshSubscription();
      await loadInvoices(); // Also refresh invoices
      toast({
        title: "Atualizado",
        description: "Status da assinatura atualizado com sucesso!"
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status da assinatura.",
        variant: "destructive"
      });
    }
  };
  const handleManageSubscription = async () => {
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        // Open Stripe Customer Portal in a new tab
        window.open(data.url, '_blank');
        toast({
          title: "Portal aberto",
          description: "O portal de gerenciamento foi aberto em uma nova aba."
        });
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast({
        title: "Erro",
        description: "Não foi possível abrir o portal de gerenciamento.",
        variant: "destructive"
      });
    }
  };
  const handleCancel = async () => {
    setShowCancellationModal(true);
  };
  const handleConfirmCancel = async () => {
    setIsCanceling(true);
    try {
      await cancelSubscription('cancel');
      toast({
        title: "Assinatura cancelada",
        description: "Sua assinatura será encerrada ao final do período de cobrança."
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível cancelar a assinatura.",
        variant: "destructive"
      });
    } finally {
      setIsCanceling(false);
    }
  };
  const handleReactivate = async () => {
    setIsCanceling(true);
    try {
      await cancelSubscription('reactivate');
      toast({
        title: "Assinatura Reativada!",
        description: "Sua assinatura foi reativada e continuará a ser cobrada normalmente."
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível reativar a assinatura.",
        variant: "destructive"
      });
    } finally {
      setIsCanceling(false);
    }
  };
  const formatCurrency = (amountCents: number, currency: string) => {
    const amount = amountCents / 100;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  };
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      paid: {
        label: 'Paga',
        variant: 'default' as const
      },
      open: {
        label: 'Em aberto',
        variant: 'secondary' as const
      },
      void: {
        label: 'Cancelada',
        variant: 'destructive' as const
      },
      uncollectible: {
        label: 'Não cobrável',
        variant: 'destructive' as const
      },
      draft: {
        label: 'Rascunho',
        variant: 'secondary' as const
      }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || {
      label: status,
      variant: 'secondary' as const
    };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };
  useEffect(() => {
    loadInvoices();
  }, []);

  // Handle success return from Stripe checkout
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('success') === 'true') {
      // Auto-refresh subscription status when returning from successful checkout
      handleRefresh();

      // Show success message
      toast({
        title: "Assinatura confirmada!",
        description: "Sua assinatura foi ativada com sucesso. As funcionalidades foram desbloqueadas."
      });

      // Clean up URL to avoid re-processing
      navigate('/subscription', {
        replace: true
      });
    }
  }, [location.search]);
  if (loading) {
    return <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Carregando informações da assinatura...</p>
          </div>
        </div>
      </Layout>;
  }
  return <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Minha Assinatura</h1>
            <p className="text-muted-foreground">
              Gerencie sua assinatura e plano atual
            </p>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Plan Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Plano Atual
                </CardTitle>
                <Badge variant={currentPlan?.slug === 'free' ? 'secondary' : 'default'}>
                  {currentPlan?.name}
                </Badge>
              </div>
              <CardDescription>
                {currentPlan?.price_cents === 0 ? 'Plano gratuito com funcionalidades básicas' : `R$ ${((currentPlan?.price_cents || 0) / 100).toFixed(2)}/mês`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Limite de Alunos</p>
                  <p className="font-semibold">{currentPlan?.student_limit}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Armazenamento</p>
                  <p className="font-semibold">
                    {currentPlan?.features.storage_mb >= 1024 ? `${(currentPlan.features.storage_mb / 1024).toFixed(0)} GB` : `${currentPlan?.features.storage_mb} MB`}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="font-medium">Funcionalidades Incluídas:</p>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${currentPlan?.features.financial_module ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <span>Módulo Financeiro {currentPlan?.features.financial_module ? 'Completo' : 'Básico'}</span>
                      {currentPlan?.features.financial_module && <div className="text-xs text-muted-foreground">
                          Gerencie faturas, pagamentos e cobranças dos seus alunos
                        </div>}
                    </div>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${currentPlan?.features.group_classes ? 'bg-green-500' : 'bg-gray-300'}`} />
                    Aulas em Grupo {currentPlan?.features.group_classes ? '' : '(Não incluído)'}
                  </li>
                  <li className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${currentPlan?.features.expenses ? 'bg-green-500' : 'bg-gray-300'}`} />
                    Cadastro de Despesas {currentPlan?.features.expenses ? '' : '(Não incluído)'}
                  </li>
                </ul>
              </div>

              {currentPlan?.slug !== 'free'}

              {currentPlan?.slug === 'free' && <Button className="w-full" onClick={() => navigate('/planos')}>
                  Fazer Upgrade
                </Button>}
            </CardContent>
          </Card>

          {/* Subscription Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Detalhes da Assinatura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription ? <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
                        {subscription.status === 'active' ? 'Ativa' : subscription.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Próxima Cobrança</p>
                      <p className="font-semibold">
                        {subscription.current_period_end ? format(new Date(subscription.current_period_end), 'dd/MM/yyyy', {
                      locale: ptBR
                    }) : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {subscription.extra_students > 0 && <>
                      <Separator />
                      <div>
                        <p className="font-medium text-amber-600">Alunos Adicionais</p>
                        <p className="text-sm text-muted-foreground">
                          {subscription.extra_students} aluno(s) adicional(is)
                        </p>
                        <p className="text-sm font-semibold">
                          + R$ {(subscription.extra_cost_cents / 100).toFixed(2)}/mês
                        </p>
                      </div>
                    </>}

                  {subscription.cancel_at_period_end && <>
                      <Separator />
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Cancelamento Agendado</AlertTitle>
                        <AlertDescription>
                          Sua assinatura será cancelada e seu acesso terminará em{' '}
                          {subscription.current_period_end ? format(new Date(subscription.current_period_end), 'dd/MM/yyyy', {
                      locale: ptBR
                    }) : 'data não definida'}.
                        </AlertDescription>
                      </Alert>
                      <Button className="w-full" variant="outline" onClick={handleReactivate} disabled={isCanceling}>
                        {isCanceling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Reativar Assinatura
                      </Button>
                    </>}

                  {!subscription.cancel_at_period_end && currentPlan?.slug !== 'free' && <>
                      <Separator />
                      
                      {/* Financial Module Warning */}
                      {currentPlan?.features?.financial_module && <Alert variant="default" className="border-amber-200 bg-amber-50">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <AlertTitle className="text-amber-800">Módulo Financeiro Ativo</AlertTitle>
                          <AlertDescription className="text-amber-700">
                            <p className="mb-2">
                              Seu plano inclui o Módulo Financeiro. <strong>Ao cancelar, todas as faturas pendentes dos seus alunos serão automaticamente canceladas</strong> e vocês perderão acesso imediatamente ao módulo.
                            </p>
                            <p className="text-sm">
                              Considere cuidadosamente antes de prosseguir. Suas configurações serão preservadas para reativação futura.
                            </p>
                          </AlertDescription>
                        </Alert>}

                      <Button className="w-full" variant="destructive" onClick={handleCancel} disabled={isCanceling}>
                        {isCanceling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Cancelar Assinatura
                      </Button>
                    </>}
                </> : <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    Você está no plano gratuito
                  </p>
                  <Button onClick={() => navigate('/planos')}>
                    Ver Planos Pagos
                  </Button>
                </div>}
            </CardContent>
          </Card>
        </div>

        {/* Billing History */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Cobrança</CardTitle>
            <CardDescription>
              Suas últimas faturas e pagamentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p>Carregando histórico de faturas...</p>
              </div> : invoicesError ? <div className="text-center py-8 text-destructive">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{invoicesError}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={loadInvoices}>
                  Tentar novamente
                </Button>
              </div> : invoices.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma fatura encontrada</p>
                <p className="text-sm">Suas faturas aparecerão aqui após a primeira cobrança</p>
              </div> : <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(invoice => <TableRow key={invoice.id}>
                      <TableCell>
                        {format(new Date(invoice.created * 1000), 'dd/MM/yyyy', {
                    locale: ptBR
                  })}
                      </TableCell>
                      <TableCell>
                        {invoice.number || '-'}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(invoice.amount_paid, invoice.currency)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(invoice.status)}
                      </TableCell>
                      <TableCell>
                        {invoice.hosted_invoice_url && <Button variant="outline" size="sm" onClick={() => window.open(invoice.hosted_invoice_url!, '_blank')}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Ver fatura
                          </Button>}
                      </TableCell>
                    </TableRow>)}
                </TableBody>
              </Table>}
          </CardContent>
        </Card>
      </div>

      {/* Cancellation Modal */}
      <SubscriptionCancellationModal isOpen={showCancellationModal} onClose={() => setShowCancellationModal(false)} onConfirm={handleConfirmCancel} />
    </Layout>;
}
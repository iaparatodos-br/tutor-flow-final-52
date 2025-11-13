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
import { ptBR, enUS } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubscriptionCancellationModal } from '@/components/SubscriptionCancellationModal';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation('subscription');
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
  
  const dateLocale = i18n.language === 'pt' ? ptBR : enUS;
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
      setInvoicesError(t('billingHistory.error'));
    } finally {
      setInvoicesLoading(false);
    }
  };
  const handleRefresh = async () => {
    try {
      await refreshSubscription();
      await loadInvoices(); // Also refresh invoices
      toast({
        title: t('messages.updated'),
        description: t('messages.updatedDescription')
      });
    } catch (error) {
      toast({
        title: t('messages.error'),
        description: t('messages.updateError'),
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
          title: t('messages.portalOpened'),
          description: t('messages.portalDescription')
        });
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast({
        title: t('messages.error'),
        description: t('messages.portalError'),
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
        title: t('messages.subscriptionCancelled'),
        description: t('messages.subscriptionCancelledDescription')
      });
    } catch (error) {
      toast({
        title: t('messages.error'),
        description: t('messages.cancelError'),
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
        title: t('messages.subscriptionReactivated'),
        description: t('messages.reactivatedDescription')
      });
    } catch (error) {
      toast({
        title: t('messages.error'),
        description: t('messages.reactivateError'),
        variant: "destructive"
      });
    } finally {
      setIsCanceling(false);
    }
  };
  const formatCurrency = (amountCents: number, currency: string) => {
    const amount = amountCents / 100;
    const locale = i18n.language === 'pt' ? 'pt-BR' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  };
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      paid: {
        label: t('invoiceStatus.paid'),
        variant: 'default' as const
      },
      open: {
        label: t('invoiceStatus.open'),
        variant: 'secondary' as const
      },
      void: {
        label: t('invoiceStatus.void'),
        variant: 'destructive' as const
      },
      uncollectible: {
        label: t('invoiceStatus.uncollectible'),
        variant: 'destructive' as const
      },
      draft: {
        label: t('invoiceStatus.draft'),
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
        title: t('messages.subscriptionConfirmed'),
        description: t('messages.subscriptionConfirmedDescription')
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
            <p>{t('messages.loading')}</p>
          </div>
        </div>
      </Layout>;
  }
  return <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">
              {t('description')}
            </p>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('refresh')}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Plan Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  {t('currentPlan')}
                </CardTitle>
                <Badge variant={currentPlan?.slug === 'free' ? 'secondary' : 'default'}>
                  {currentPlan?.name}
                </Badge>
              </div>
              <CardDescription>
                {currentPlan?.price_cents === 0 
                  ? t('freePlanDescription') 
                  : `${formatCurrency(currentPlan?.price_cents || 0, 'BRL')}/${t('periods.monthly').toLowerCase()}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('studentLimit')}</p>
                  <p className="font-semibold">{currentPlan?.student_limit}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('storage')}</p>
                  <p className="font-semibold">
                    {currentPlan?.features.storage_mb >= 1024 
                      ? `${(currentPlan.features.storage_mb / 1024).toFixed(0)} GB` 
                      : `${currentPlan?.features.storage_mb} MB`}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="font-medium">{t('featuresIncluded')}</p>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${currentPlan?.features.financial_module ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <span>
                        {t('financialModule.label')} {currentPlan?.features.financial_module ? t('financialModule.complete') : t('financialModule.basic')}
                      </span>
                      {currentPlan?.features.financial_module && (
                        <div className="text-xs text-muted-foreground">
                          {t('financialModule.description')}
                        </div>
                      )}
                    </div>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${currentPlan?.features.group_classes ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {t('groupClasses')} {!currentPlan?.features.group_classes && t('notIncluded')}
                  </li>
                  <li className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${currentPlan?.features.expenses ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {t('expenses')} {!currentPlan?.features.expenses && t('notIncluded')}
                  </li>
                </ul>
              </div>

              {currentPlan?.slug !== 'free'}

              {currentPlan?.slug === 'free' && (
                <Button className="w-full" onClick={() => navigate('/planos')}>
                  {t('upgradeButton')}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Subscription Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                {t('subscriptionDetails')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription ? <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">{t('status.label')}</p>
                      <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
                        {subscription.status === 'active' ? t('status.active') : subscription.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('nextBilling')}</p>
                      <p className="font-semibold">
                        {subscription.current_period_end 
                          ? format(new Date(subscription.current_period_end), 'dd/MM/yyyy', { locale: dateLocale }) 
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {subscription.extra_students > 0 && <>
                      <Separator />
                      <div>
                        <p className="font-medium text-amber-600">{t('additionalStudents')}</p>
                        <p className="text-sm text-muted-foreground">
                          {subscription.extra_students} {t('additionalStudentsCount', { count: subscription.extra_students })}
                        </p>
                        <p className="text-sm font-semibold">
                          + {formatCurrency(subscription.extra_cost_cents, 'BRL')}/{t('periods.monthly').toLowerCase()}
                        </p>
                      </div>
                    </>}

                  {subscription.cancel_at_period_end && <>
                      <Separator />
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>{t('scheduledCancellation')}</AlertTitle>
                        <AlertDescription>
                          {t('cancellationMessage')}{' '}
                          {subscription.current_period_end 
                            ? format(new Date(subscription.current_period_end), 'dd/MM/yyyy', { locale: dateLocale }) 
                            : t('dateUndefined')}.
                        </AlertDescription>
                      </Alert>
                      <Button className="w-full" variant="outline" onClick={handleReactivate} disabled={isCanceling}>
                        {isCanceling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('reactivateButton')}
                      </Button>
                    </>}

                  {!subscription.cancel_at_period_end && currentPlan?.slug !== 'free' && <>
                      <Separator />
                      
                      {/* Financial Module Warning */}
                      {currentPlan?.features?.financial_module && (
                        <Alert variant="default" className="border-amber-200 bg-amber-50">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <AlertTitle className="text-amber-800">{t('financialModuleWarning.title')}</AlertTitle>
                          <AlertDescription className="text-amber-700">
                            <p className="mb-2">
                              {t('financialModuleWarning.description')}
                            </p>
                            <p className="text-sm">
                              {t('financialModuleWarning.consideration')}
                            </p>
                          </AlertDescription>
                        </Alert>
                      )}

                      <Button className="w-full" variant="destructive" onClick={handleCancel} disabled={isCanceling}>
                        {isCanceling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('cancel')}
                      </Button>
                    </>}
                </> : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">
                      {t('freePlanMessage')}
                    </p>
                    <Button onClick={() => navigate('/planos')}>
                      {t('viewPaidPlans')}
                    </Button>
                  </div>
                )}
            </CardContent>
          </Card>
        </div>

        {/* Billing History */}
        <Card>
          <CardHeader>
            <CardTitle>{t('billingHistory.title')}</CardTitle>
            <CardDescription>
              {t('billingHistory.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p>{t('billingHistory.loading')}</p>
              </div>
            ) : invoicesError ? (
              <div className="text-center py-8 text-destructive">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{invoicesError}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={loadInvoices}>
                  {t('billingHistory.tryAgain')}
                </Button>
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('billingHistory.empty')}</p>
                <p className="text-sm">{t('billingHistory.emptyDescription')}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('billingHistory.date')}</TableHead>
                    <TableHead>{t('billingHistory.number')}</TableHead>
                    <TableHead>{t('billingHistory.amount')}</TableHead>
                    <TableHead>{t('billingHistory.status')}</TableHead>
                    <TableHead>{t('billingHistory.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(invoice => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        {format(new Date(invoice.created * 1000), 'dd/MM/yyyy', { locale: dateLocale })}
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
                        {invoice.hosted_invoice_url && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => window.open(invoice.hosted_invoice_url!, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            {t('billingHistory.viewInvoice')}
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

      {/* Cancellation Modal */}
      <SubscriptionCancellationModal isOpen={showCancellationModal} onClose={() => setShowCancellationModal(false)} onConfirm={handleConfirmCancel} />
    </Layout>;
}
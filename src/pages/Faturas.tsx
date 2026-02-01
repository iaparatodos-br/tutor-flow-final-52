import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge';
import { InvoiceTypeBadge } from '@/components/InvoiceTypeBadge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { useTeacherContext } from '@/contexts/TeacherContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, FileText, RefreshCw, Loader2, Users } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { openExternalUrl, onBrowserClosed } from '@/utils/browser';
import { cn } from '@/lib/utils';

interface Invoice {
  id: string;
  created_at: string;
  due_date: string;
  amount: number;
  status: 'paid' | 'open' | 'overdue' | 'void' | 'draft' | 'paga' | 'pendente' | 'vencida' | 'cancelada' | 'falha_pagamento';
  stripe_hosted_invoice_url: string | null;
  description: string | null;
  payment_origin: string | null;
  manual_payment_notes: string | null;
  payment_intent_cancelled_at: string | null;
  payment_intent_cancelled_by: string | null;
  invoice_type: string | null;
  student_id: string;
  payment_method: string | null;
  boleto_url: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  student?: {
    id: string;
    name: string;
    email: string;
  };
}

export default function Faturas() {
  const { selectedTeacherId, loading: teacherLoading } = useTeacherContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation('financial');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [changeMethodDialogOpen, setChangeMethodDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [changingMethod, setChangingMethod] = useState(false);
  
  // Deep-linking support from Inbox
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  // Query para buscar IDs de dependentes do usuário
  const { data: dependentIds = [] } = useQuery({
    queryKey: ['userDependentIds', user?.id, selectedTeacherId],
    queryFn: async () => {
      if (!user?.id || !selectedTeacherId) return [];
      
      // Buscar dependentes onde o usuário é o responsável
      const { data, error } = await supabase
        .from('dependents')
        .select('id')
        .eq('responsible_id', user.id)
        .eq('teacher_id', selectedTeacherId);

      if (error) {
        console.error('Error fetching dependents:', error);
        return [];
      }

      return data?.map(d => d.id) || [];
    },
    enabled: !!user?.id && !!selectedTeacherId,
  });

  // Query principal de faturas (próprias + dependentes)
  const { data: invoices, isLoading, error, refetch } = useQuery({
    queryKey: ['studentInvoices', selectedTeacherId, user?.id, dependentIds],
    queryFn: async () => {
      if (!selectedTeacherId || !user?.id) return [];

      // Buscar faturas do próprio usuário
      let query = supabase
        .from('invoices')
        .select(`
          id, created_at, due_date, amount, status, stripe_hosted_invoice_url, 
          description, teacher_id, payment_origin, manual_payment_notes, 
          payment_intent_cancelled_at, payment_intent_cancelled_by, invoice_type,
          student_id, payment_method, boleto_url, pix_qr_code, pix_copy_paste,
          student:profiles!invoices_student_id_fkey(id, name, email)
        `)
        .eq('teacher_id', selectedTeacherId);

      // Combinar IDs: usuário + dependentes
      const allStudentIds = [user.id, ...dependentIds];
      query = query.in('student_id', allStudentIds);

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return data as Invoice[];
    },
    enabled: !!selectedTeacherId && !!user?.id,
  });

  const handlePayNow = async (invoice: Invoice) => {
    // Configurar callback para quando browser fechar (atualizar dados)
    await onBrowserClosed(() => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['studentInvoices'] });
    });

    // Se tem método de pagamento definido, abrir URL correspondente
    if (invoice.payment_method === 'boleto' && invoice.boleto_url) {
      await openExternalUrl(invoice.boleto_url);
    } else if (invoice.stripe_hosted_invoice_url) {
      await openExternalUrl(invoice.stripe_hosted_invoice_url);
    }
  };

  const handleChoosePaymentMethod = async (invoice: Invoice) => {
    // Configurar callback para quando browser fechar
    await onBrowserClosed(() => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['studentInvoices'] });
    });

    // Abrir modal ou página de escolha de método
    if (invoice.stripe_hosted_invoice_url) {
      await openExternalUrl(invoice.stripe_hosted_invoice_url);
    }
  };

  const handleViewReceipt = (invoiceId: string) => {
    navigate(`/recibo/${invoiceId}`);
  };

  const openChangeMethodDialog = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setChangeMethodDialogOpen(true);
  };

  const handleChangePaymentMethod = async () => {
    if (!selectedInvoice) return;

    setChangingMethod(true);
    try {
      const { data, error } = await supabase.functions.invoke('change-payment-method', {
        body: { invoice_id: selectedInvoice.id }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: t('studentInvoices.changePaymentMethod.success'),
      });

      setChangeMethodDialogOpen(false);
      setSelectedInvoice(null);
      
      // Refetch invoices
      queryClient.invalidateQueries({ queryKey: ['studentInvoices'] });
      refetch();
    } catch (error: any) {
      console.error('Error changing payment method:', error);
      toast({
        title: t('studentInvoices.changePaymentMethod.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setChangingMethod(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  };

  const canChangePaymentMethod = (invoice: Invoice) => {
    const changeableStatuses = ['open', 'pendente', 'overdue', 'vencida', 'falha_pagamento'];
    return changeableStatuses.includes(invoice.status) && invoice.payment_method;
  };

  const hasPaymentReady = (invoice: Invoice) => {
    return invoice.boleto_url || invoice.pix_qr_code || invoice.stripe_hosted_invoice_url;
  };

  const isDependent = (invoice: Invoice) => {
    return invoice.student_id !== user?.id;
  };

  // Deep-linking: Process URL parameters from Inbox navigation
  useEffect(() => {
    const highlightParam = searchParams.get('highlight');
    
    if (highlightParam && invoices) {
      setHighlightedInvoiceId(highlightParam);
      
      // Clear URL params after processing
      setSearchParams({}, { replace: true });
      
      // Clear highlight after 5 seconds
      setTimeout(() => setHighlightedInvoiceId(null), 5000);
    }
  }, [searchParams, setSearchParams, invoices]);

  // Scroll to highlighted invoice when it's set and data is loaded
  useEffect(() => {
    if (highlightedInvoiceId && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedInvoiceId, invoices]);

  // Loading state while teacher context is loading
  if (teacherLoading) {
    return (
      <Layout>
        <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">{t('studentInvoices.title')}</h1>
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
            <h1 className="text-3xl font-bold">{t('studentInvoices.title')}</h1>
          </div>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('studentInvoices.selectTeacher')}
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
          <h1 className="text-3xl font-bold">{t('studentInvoices.title')}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('studentInvoices.billingHistory')}</CardTitle>
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
                <p className="text-destructive">{t('studentInvoices.loadError')}</p>
              </div>
            ) : !invoices || invoices.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">{t('studentInvoices.noInvoices')}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('studentInvoices.columns.date')}</TableHead>
                    <TableHead>{t('studentInvoices.columns.description')}</TableHead>
                    <TableHead>{t('studentInvoices.columns.dueDate')}</TableHead>
                    <TableHead>{t('studentInvoices.columns.amount')}</TableHead>
                    <TableHead>{t('studentInvoices.columns.status')}</TableHead>
                    <TableHead className="text-right">{t('studentInvoices.columns.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {invoices.map((invoice) => (
                    <TableRow 
                      key={invoice.id}
                      ref={invoice.id === highlightedInvoiceId ? highlightedRowRef : null}
                      className={cn(
                        invoice.id === highlightedInvoiceId && 'ring-2 ring-primary animate-pulse bg-primary/5'
                      )}
                    >
                      <TableCell>
                        {format(new Date(invoice.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {invoice.description || t('studentInvoices.defaultDescription')}
                          {isDependent(invoice) && (
                            <Badge variant="outline" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {invoice.student?.name || t('studentInvoices.dependentBadge')}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {invoice.due_date 
                          ? format(new Date(invoice.due_date), 'dd/MM/yyyy', { locale: ptBR }) 
                          : '-'
                        }
                      </TableCell>
                      <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <InvoiceTypeBadge invoiceType={invoice.invoice_type} />
                          <InvoiceStatusBadge 
                            status={invoice.status} 
                            paymentOrigin={invoice.payment_origin}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Faturas pendentes/vencidas */}
                          {(invoice.status === 'open' || 
                            invoice.status === 'overdue' || 
                            invoice.status === 'pendente' || 
                            invoice.status === 'vencida' ||
                            invoice.status === 'falha_pagamento') && (
                            <>
                              {hasPaymentReady(invoice) ? (
                                <>
                                  <Button 
                                    onClick={() => handlePayNow(invoice)}
                                    size="sm"
                                  >
                                    {t('studentInvoices.payNow')}
                                  </Button>
                                  {canChangePaymentMethod(invoice) && (
                                    <Button 
                                      onClick={() => openChangeMethodDialog(invoice)}
                                      size="sm"
                                      variant="outline"
                                    >
                                      <RefreshCw className="h-4 w-4" />
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <Button 
                                  onClick={() => handleChoosePaymentMethod(invoice)}
                                  size="sm"
                                  variant="outline"
                                  disabled={!invoice.stripe_hosted_invoice_url}
                                >
                                  {invoice.stripe_hosted_invoice_url 
                                    ? t('studentInvoices.choosePaymentMethod')
                                    : t('studentInvoices.noPaymentMethod')
                                  }
                                </Button>
                              )}
                            </>
                          )}

                          {/* Faturas pagas */}
                          {(invoice.status === 'paid' || invoice.status === 'paga') && (
                            <Button 
                              onClick={() => handleViewReceipt(invoice.id)}
                              size="sm"
                              variant="outline"
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              {t('studentInvoices.viewReceipt')}
                            </Button>
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

      {/* Change Payment Method Dialog */}
      <Dialog open={changeMethodDialogOpen} onOpenChange={setChangeMethodDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('studentInvoices.changePaymentMethod.title')}</DialogTitle>
            <DialogDescription>
              {t('studentInvoices.changePaymentMethod.description')}
            </DialogDescription>
          </DialogHeader>
          
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('studentInvoices.changePaymentMethod.warning')}
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setChangeMethodDialogOpen(false)}
              disabled={changingMethod}
            >
              {t('studentInvoices.changePaymentMethod.cancel')}
            </Button>
            <Button
              onClick={handleChangePaymentMethod}
              disabled={changingMethod}
            >
              {changingMethod && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('studentInvoices.changePaymentMethod.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

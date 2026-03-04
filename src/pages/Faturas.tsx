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
import { Skeleton } from '@/components/ui/skeleton';
import { useTeacherContext } from '@/contexts/TeacherContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, FileText, Users } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { openExternalUrl, onBrowserClosed } from '@/utils/browser';
import { cn } from '@/lib/utils';
import { formatInTimezone, DEFAULT_TIMEZONE } from '@/utils/timezone';
import { useProfile } from '@/contexts/ProfileContext';

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
  student?: {
    id: string;
    name: string;
    email: string;
  };
}

export default function Faturas() {
  const { selectedTeacherId, loading: teacherLoading } = useTeacherContext();
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { t } = useTranslation('financial');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const userTimezone = profile?.timezone || DEFAULT_TIMEZONE;

  // Deep-linking support from Inbox
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  // Query para buscar IDs de dependentes do usuário
  const { data: dependentIds = [] } = useQuery({
    queryKey: ['userDependentIds', user?.id, selectedTeacherId],
    queryFn: async () => {
      if (!user?.id || !selectedTeacherId) return [];

      const { data, error } = await supabase.
      from('dependents').
      select('id').
      eq('responsible_id', user.id).
      eq('teacher_id', selectedTeacherId);

      if (error) {
        console.error('Error fetching dependents:', error);
        return [];
      }

      return data?.map((d) => d.id) || [];
    },
    enabled: !!user?.id && !!selectedTeacherId
  });

  const { data: invoices, isLoading, error, refetch } = useQuery({
    queryKey: ['studentInvoices', selectedTeacherId, user?.id, dependentIds],
    queryFn: async () => {
      if (!selectedTeacherId || !user?.id) return [];

      let query = supabase.
      from('invoices').
      select(`
          id, created_at, due_date, amount, status, stripe_hosted_invoice_url, 
          description, teacher_id, payment_origin, manual_payment_notes, 
          payment_intent_cancelled_at, payment_intent_cancelled_by, invoice_type,
          student_id, payment_method, boleto_url,
          student:profiles!invoices_student_id_fkey(id, name, email)
        `).
      eq('teacher_id', selectedTeacherId);

      const allStudentIds = [user.id, ...dependentIds];
      query = query.in('student_id', allStudentIds);

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return data as Invoice[];
    },
    enabled: !!selectedTeacherId && !!user?.id
  });

  const handlePayNow = async (invoice: Invoice) => {
    await onBrowserClosed(() => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['studentInvoices'] });
    });

    if (invoice.boleto_url) {
      await openExternalUrl(invoice.boleto_url);
    } else if (invoice.stripe_hosted_invoice_url) {
      await openExternalUrl(invoice.stripe_hosted_invoice_url);
    }
  };

  const handleViewReceipt = (invoiceId: string) => {
    navigate(`/recibo/${invoiceId}`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount);
  };

  const hasPaymentReady = (invoice: Invoice) => {
    return invoice.boleto_url || invoice.stripe_hosted_invoice_url;
  };

  const isDependent = (invoice: Invoice) => {
    return invoice.student_id !== user?.id;
  };

  /**
   * Formata campo date-only (YYYY-MM-DD) sem conversão de timezone.
   * REGRA v3.6: parseISO ou split manual para campos date.
   */
  const formatDateOnly = (dateString: string): string => {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateString;
  };

  // Deep-linking
  useEffect(() => {
    const highlightParam = searchParams.get('highlight');

    if (highlightParam && invoices) {
      setHighlightedInvoiceId(highlightParam);
      setSearchParams({}, { replace: true });
      setTimeout(() => setHighlightedInvoiceId(null), 5000);
    }
  }, [searchParams, setSearchParams, invoices]);

  useEffect(() => {
    if (highlightedInvoiceId && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedInvoiceId, invoices]);

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
      </Layout>);
  }

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
      </Layout>);
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
            {isLoading ?
            <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div> :
            error ?
            <div className="text-center py-8">
                <p className="text-destructive">{t('studentInvoices.loadError')}</p>
              </div> :
            !invoices || invoices.length === 0 ?
            <div className="text-center py-8">
                <p className="text-muted-foreground">{t('studentInvoices.noInvoices')}</p>
              </div> :

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
                {invoices.map((invoice) =>
                <TableRow
                  key={invoice.id}
                  ref={invoice.id === highlightedInvoiceId ? highlightedRowRef : null}
                  className={cn(
                    invoice.id === highlightedInvoiceId && 'ring-2 ring-primary animate-pulse bg-primary/5'
                  )}>

                      <TableCell>
                        {/* created_at é timestamptz — usar formatInTimezone */}
                        {formatInTimezone(invoice.created_at, 'dd/MM/yyyy', userTimezone)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {invoice.description || t('studentInvoices.defaultDescription')}
                          {isDependent(invoice) &&
                      <Badge variant="outline" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {invoice.student?.name || t('studentInvoices.dependentBadge')}
                            </Badge>
                      }
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* due_date é date-only — NUNCA usar timeZone */}
                        {invoice.due_date ? formatDateOnly(invoice.due_date) : '-'}
                      </TableCell>
                      <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <InvoiceTypeBadge invoiceType={invoice.invoice_type} />
                          <InvoiceStatusBadge
                        status={invoice.status}
                        paymentOrigin={invoice.payment_origin} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(invoice.status === 'open' ||
                      invoice.status === 'overdue' ||
                      invoice.status === 'pendente' ||
                      invoice.status === 'vencida' ||
                      invoice.status === 'falha_pagamento') &&
                      <>
                              {hasPaymentReady(invoice) ?
                        <Button
                          onClick={() => handlePayNow(invoice)}
                          size="sm">
                                  {t('studentInvoices.payNow')}
                                </Button> :
                        <span className="text-sm text-muted-foreground">
                                  Sem boleto
                                </span>
                        }
                            </>
                      }

                          {(invoice.status === 'paid' || invoice.status === 'paga') &&
                      <Button
                        onClick={() => handleViewReceipt(invoice.id)}
                        size="sm"
                        variant="outline">
                              <FileText className="h-4 w-4 mr-2" />
                              {t('studentInvoices.viewReceipt')}
                            </Button>
                      }
                        </div>
                      </TableCell>
                    </TableRow>
                )}
                </TableBody>
              </Table>
            }
          </CardContent>
        </Card>
      </div>
    </Layout>);
}

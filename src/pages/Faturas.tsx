import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge';
import { InvoiceTypeBadge } from '@/components/InvoiceTypeBadge';
import { format } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { useTeacherContext } from '@/contexts/TeacherContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, FileText, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PaymentOptionsCard } from '@/components/PaymentOptionsCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslation } from 'react-i18next';

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
  invoice_type: string | null;
  boleto_url: string | null;
  linha_digitavel: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  stripe_payment_intent_id: string | null;
}

const fetchStudentInvoices = async (teacherId: string) => {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      id, 
      created_at, 
      due_date, 
      amount, 
      status, 
      stripe_hosted_invoice_url, 
      description, 
      teacher_id, 
      payment_origin, 
      manual_payment_notes, 
      payment_intent_cancelled_at, 
      payment_intent_cancelled_by, 
      invoice_type,
      boleto_url,
      linha_digitavel,
      pix_qr_code,
      pix_copy_paste,
      stripe_payment_intent_id
    `)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as Invoice[];
};

export default function Faturas() {
  const { t, i18n } = useTranslation('financial');
  const { selectedTeacherId, loading: teacherLoading } = useTeacherContext();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const { data: invoices, isLoading, error, refetch } = useQuery({
    queryKey: ['studentInvoices', selectedTeacherId],
    queryFn: () => fetchStudentInvoices(selectedTeacherId!),
    enabled: !!selectedTeacherId,
  });

  const handlePayNow = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSuccess = () => {
    setIsPaymentModalOpen(false);
    setSelectedInvoice(null);
    refetch();
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

  const dateLocale = i18n.language === 'pt' ? ptBR : enUS;

  // Convert Invoice to format expected by PaymentOptionsCard
  const convertInvoiceForPaymentCard = (invoice: Invoice) => ({
    id: invoice.id,
    amount: invoice.amount.toString(),
    due_date: invoice.due_date,
    description: invoice.description || t('invoiceDefaultDescription'),
    status: invoice.status,
    boleto_url: invoice.boleto_url || undefined,
    linha_digitavel: invoice.linha_digitavel || undefined,
    pix_qr_code: invoice.pix_qr_code || undefined,
    pix_copy_paste: invoice.pix_copy_paste || undefined,
    stripe_payment_intent_id: invoice.stripe_payment_intent_id || undefined,
  });

  // Loading state while teacher context is loading
  if (teacherLoading) {
    return (
      <Layout>
        <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">{t('myInvoices')}</h1>
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
            <h1 className="text-3xl font-bold">{t('myInvoices')}</h1>
          </div>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('selectTeacherToViewInvoices')}
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  // Payment Modal - Responsive (Drawer on mobile, Dialog on desktop)
  const PaymentModal = () => {
    if (!selectedInvoice) return null;

    const modalContent = (
      <div className="p-4">
        <PaymentOptionsCard 
          invoice={convertInvoiceForPaymentCard(selectedInvoice)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      </div>
    );

    if (isMobile) {
      return (
        <Drawer open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t('paymentOptions.title')}
              </DrawerTitle>
            </DrawerHeader>
            {modalContent}
          </DrawerContent>
        </Drawer>
      );
    }

    return (
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('paymentOptions.title')}
            </DialogTitle>
          </DialogHeader>
          {modalContent}
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{t('myInvoices')}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('chargeHistory')}</CardTitle>
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
                <p className="text-destructive">{t('messages.loadError')}</p>
              </div>
            ) : !invoices || invoices.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">{t('noInvoicesFound')}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead>{t('description')}</TableHead>
                    <TableHead>{t('dueDate')}</TableHead>
                    <TableHead>{t('amount')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead className="text-right">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        {format(new Date(invoice.created_at), 'dd/MM/yyyy', { locale: dateLocale })}
                      </TableCell>
                      <TableCell>
                        {invoice.description || t('invoiceDefaultDescription')}
                      </TableCell>
                      <TableCell>
                        {invoice.due_date 
                          ? format(new Date(invoice.due_date), 'dd/MM/yyyy', { locale: dateLocale }) 
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
                        {/* Faturas pendentes/vencidas: Botão "Pagar Agora" - Abre modal com opções */}
                        {(invoice.status === 'open' || 
                          invoice.status === 'overdue' || 
                          invoice.status === 'pendente' || 
                          invoice.status === 'vencida') && (
                          <Button 
                            onClick={() => handlePayNow(invoice)}
                            size="sm"
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            {t('payNow')}
                          </Button>
                        )}

                        {/* Faturas pagas: Botão "Ver Recibo" */}
                        {(invoice.status === 'paid' || invoice.status === 'paga') && (
                          <Button 
                            onClick={() => handleViewReceipt(invoice.id)}
                            size="sm"
                            variant="outline"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            {t('viewReceipt')}
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
      
      {/* Payment Options Modal */}
      <PaymentModal />
    </Layout>
  );
}

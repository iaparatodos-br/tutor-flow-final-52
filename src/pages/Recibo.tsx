import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Printer, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge';
import { useTranslation } from 'react-i18next';
import { useProfile } from '@/contexts/ProfileContext';
import { formatInTimezone, DEFAULT_TIMEZONE } from '@/utils/timezone';
import './recibo.css';
interface Invoice {
  id: string;
  created_at: string;
  due_date: string;
  amount: number;
  status: 'paid' | 'open' | 'overdue' | 'void' | 'draft' | 'paga' | 'pendente' | 'vencida' | 'cancelada';
  description: string | null;
  payment_origin: string | null;
  manual_payment_notes: string | null;
  stripe_payment_intent_id: string | null;
  updated_at: string;
  teacher_id: string;
  student_id: string;
  teacher: {
    name: string;
    email: string;
  };
  student: {
    name: string;
    email: string;
  };
  business_profile: {
    business_name: string;
    cnpj: string | null;
  } | null;
  guardian_name: string | null;
  guardian_email: string | null;
}
const fetchInvoiceDetails = async (invoiceId: string) => {
  const {
    data,
    error
  } = await supabase.from('invoices').select(`
      id,
      created_at,
      due_date,
      amount,
      status,
      description,
      payment_origin,
      manual_payment_notes,
      stripe_payment_intent_id,
      updated_at,
      teacher_id,
      student_id,
      teacher:profiles!invoices_teacher_id_fkey(name, email),
      student:profiles!invoices_student_id_fkey(name, email),
      business_profile:business_profiles!invoices_business_profile_id_fkey(business_name, cnpj)
    `).eq('id', invoiceId).single();
  if (error) throw new Error(error.message);

  let guardianName: string | null = null;
  let guardianEmail: string | null = null;

  if (data.teacher_id && data.student_id) {
    const { data: relData } = await supabase
      .from('teacher_student_relationships' as never)
      .select('student_guardian_name, student_guardian_email')
      .eq('teacher_id', data.teacher_id)
      .eq('student_id', data.student_id)
      .maybeSingle();

    if (relData) {
      const rel = relData as { student_guardian_name: string | null; student_guardian_email: string | null };
      guardianName = rel.student_guardian_name;
      guardianEmail = rel.student_guardian_email;
    }
  }

  return {
    ...data,
    guardian_name: guardianName,
    guardian_email: guardianEmail,
  } as Invoice;
};
export default function Recibo() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('financial');
  const { profile } = useProfile();
  
  const userTimezone = profile?.timezone || DEFAULT_TIMEZONE;

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice-details', invoiceId],
    queryFn: () => fetchInvoiceDetails(invoiceId!),
    enabled: !!invoiceId
  });

  /**
   * Formata campo date-only (YYYY-MM-DD) sem conversão de timezone.
   * REGRA v3.6: NUNCA usar timeZone para campos date.
   */
  const formatDateOnly = (dateString: string, longFormat: boolean = false): string => {
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    
    if (longFormat) {
      const months = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
      ];
      const day = parseInt(parts[2], 10);
      const month = months[parseInt(parts[1], 10) - 1];
      const year = parts[0];
      return `${String(day).padStart(2, '0')} de ${month} de ${year}`;
    }
    
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };
  const getPaymentOriginLabel = (origin: string | null) => {
    switch (origin) {
      case 'manual':
        return t('paymentOrigins.manual');
      case 'stripe':
        return t('paymentOrigins.stripe');
      case 'automatic':
        return t('paymentOrigins.automatic');
      default:
        return t('paymentOrigins.unspecified');
    }
  };
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount);
  };
  const handlePrint = () => {
    window.print();
  };
  const handleDownloadPdf = () => {
    toast.info(t('receipt.pdfInstructions', 'No diálogo de impressão, selecione "Salvar como PDF" como destino.'));
    setTimeout(() => {
      window.print();
    }, 500);
  };
  if (isLoading) {
    return <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-12 w-48 mb-8" />
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>;
  }
  if (error || !invoice) {
    return <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <Button onClick={() => navigate('/faturas')} variant="ghost" className="mb-8">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">Erro ao carregar recibo. Fatura não encontrada.</p>
            </CardContent>
          </Card>
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        {/* Botões de ação (ocultos na impressão) */}
        <div className="flex gap-4 mb-8 print:hidden">
          <Button onClick={() => navigate(-1)} variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('receipt.back', 'Voltar')}
          </Button>
          
          <Button onClick={handleDownloadPdf} variant="default">
            <Download className="mr-2 h-4 w-4" />
            {t('receipt.downloadPdf', 'Baixar PDF')}
          </Button>
        </div>

        {/* Recibo */}
        <Card>
          <CardHeader className="text-center border-b">
            <div className="flex items-center justify-center mb-4">
              <FileText className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-3xl">Recibo de Pagamento</CardTitle>
            <p className="text-muted-foreground">
              #{invoice.id.substring(0, 8).toUpperCase()}
            </p>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* Status */}
            <div className="flex justify-center">
              <InvoiceStatusBadge status={invoice.status} paymentOrigin={invoice.payment_origin} />
            </div>

            <Separator />

            {/* Informações do Negócio/Professor */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Emitido por:</h3>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium text-lg">
                  {invoice.business_profile?.business_name || invoice.teacher.name}
                </p>
                {invoice.business_profile?.cnpj && <p className="text-sm text-muted-foreground">
                    CNPJ: {invoice.business_profile.cnpj}
                  </p>}
                <p className="text-sm text-muted-foreground">{invoice.teacher.email}</p>
              </div>
            </div>

            <Separator />

            {/* Informações do Aluno */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Pagador:</h3>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium">{invoice.student.name}</p>
                <p className="text-sm text-muted-foreground">{invoice.student.email}</p>
                {invoice.guardian_name && <>
                    <p className="text-sm text-muted-foreground mt-2">
                      Responsável: {invoice.guardian_name}
                    </p>
                    {invoice.guardian_email && <p className="text-sm text-muted-foreground">
                        {invoice.guardian_email}
                      </p>}
                  </>}
              </div>
            </div>

            <Separator />

            {/* Detalhes da Cobrança */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Detalhes da Cobrança:</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data de Emissão:</span>
                  <span className="font-medium">
                    {formatInTimezone(invoice.created_at, "dd 'de' MMMM 'de' yyyy", userTimezone)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vencimento:</span>
                  <span className="font-medium">
                    {formatDateOnly(invoice.due_date, true)}
                  </span>
                </div>
                {invoice.description && <div className="flex justify-between">
                    <span className="text-muted-foreground">Descrição:</span>
                    <span className="font-medium">{invoice.description}</span>
                  </div>}
                {invoice.stripe_payment_intent_id && <div className="flex justify-between">
                    <span className="text-muted-foreground">ID da Transação:</span>
                    <span className="font-mono text-sm">
                      {invoice.stripe_payment_intent_id.substring(0, 20)}...
                    </span>
                  </div>}
              </div>
            </div>

            <Separator />

            {/* Informações de Pagamento */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Informações de Pagamento:</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('receipt.paymentMethod')}:</span>
                  <span className="font-medium">
                    {getPaymentOriginLabel(invoice.payment_origin)}
                  </span>
                </div>
                {(invoice.status === 'paid' || invoice.status === 'paga') && <div className="flex justify-between">
                    <span className="text-muted-foreground">Data de Pagamento:</span>
                    <span className="font-medium">
                      {formatInTimezone(invoice.updated_at, "dd 'de' MMMM 'de' yyyy", userTimezone)}
                    </span>
                  </div>}
                {invoice.manual_payment_notes && <div className="bg-muted p-3 rounded">
                    <p className="text-sm text-muted-foreground mb-1">Observações:</p>
                    <p className="text-sm">{invoice.manual_payment_notes}</p>
                  </div>}
              </div>
            </div>

            <Separator />

            {/* Valor Total */}
            <div className="bg-primary/10 p-6 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-xl font-semibold">Valor Total:</span>
                <span className="text-3xl font-bold text-primary">
                  {formatCurrency(invoice.amount)}
                </span>
              </div>
            </div>

            {/* Rodapé */}
            <div className="text-center text-sm text-muted-foreground pt-4 border-t">
              <p>Este é um recibo digital gerado automaticamente.</p>
              <p className="mt-1">
                Recibo gerado em {formatInTimezone(new Date(), "dd/MM/yyyy 'às' HH:mm", userTimezone)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>;
}

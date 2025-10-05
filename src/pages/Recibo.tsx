import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Printer, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge';
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
  teacher: {
    name: string;
    email: string;
  };
  student: {
    name: string;
    email: string;
    guardian_name: string | null;
    guardian_email: string | null;
  };
  business_profile: {
    business_name: string;
    cnpj: string | null;
  } | null;
}

const fetchInvoiceDetails = async (invoiceId: string) => {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
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
      teacher:profiles!invoices_teacher_id_fkey(name, email),
      student:profiles!invoices_student_id_fkey(name, email, guardian_name, guardian_email),
      business_profile:business_profiles(business_name, cnpj)
    `)
    .eq('id', invoiceId)
    .single();

  if (error) throw new Error(error.message);
  return data as Invoice;
};

export default function Recibo() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice-details', invoiceId],
    queryFn: () => fetchInvoiceDetails(invoiceId!),
    enabled: !!invoiceId,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
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
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-background p-8">
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        {/* Botões de ação (ocultos na impressão) */}
        <div className="flex gap-4 mb-8 print:hidden">
          <Button onClick={() => navigate('/faturas')} variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={handlePrint} variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
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
              <InvoiceStatusBadge 
                status={invoice.status} 
                paymentOrigin={invoice.payment_origin}
              />
            </div>

            <Separator />

            {/* Informações do Negócio/Professor */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Emitido por:</h3>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium text-lg">
                  {invoice.business_profile?.business_name || invoice.teacher.name}
                </p>
                {invoice.business_profile?.cnpj && (
                  <p className="text-sm text-muted-foreground">
                    CNPJ: {invoice.business_profile.cnpj}
                  </p>
                )}
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
                {invoice.student.guardian_name && (
                  <>
                    <p className="text-sm text-muted-foreground mt-2">
                      Responsável: {invoice.student.guardian_name}
                    </p>
                    {invoice.student.guardian_email && (
                      <p className="text-sm text-muted-foreground">
                        {invoice.student.guardian_email}
                      </p>
                    )}
                  </>
                )}
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
                    {format(new Date(invoice.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vencimento:</span>
                  <span className="font-medium">
                    {format(new Date(invoice.due_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </span>
                </div>
                {invoice.description && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Descrição:</span>
                    <span className="font-medium">{invoice.description}</span>
                  </div>
                )}
                {invoice.stripe_payment_intent_id && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID da Transação:</span>
                    <span className="font-mono text-sm">
                      {invoice.stripe_payment_intent_id.substring(0, 20)}...
                    </span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Informações de Pagamento */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Informações de Pagamento:</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Forma de Pagamento:</span>
                  <span className="font-medium">
                    {invoice.payment_origin === 'manual' ? 'Pagamento Manual' : 
                     invoice.payment_origin === 'stripe' ? 'Stripe' : 
                     invoice.payment_origin === 'automatic' ? 'Cobrança Automática' : 
                     'Não especificado'}
                  </span>
                </div>
                {(invoice.status === 'paid' || invoice.status === 'paga') && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data de Pagamento:</span>
                    <span className="font-medium">
                      {format(new Date(invoice.updated_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {invoice.manual_payment_notes && (
                  <div className="bg-muted p-3 rounded">
                    <p className="text-sm text-muted-foreground mb-1">Observações:</p>
                    <p className="text-sm">{invoice.manual_payment_notes}</p>
                  </div>
                )}
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
                Recibo gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

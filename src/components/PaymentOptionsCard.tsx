import { useState } from "react";
import { StripeAccountGuard } from "@/components/StripeAccountGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Receipt, 
  Download, 
  Copy, 
  ExternalLink,
  Calendar,
  DollarSign,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MINIMUM_BOLETO_AMOUNT } from "@/utils/stripe-fees";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Invoice {
  id: string;
  amount: string;
  due_date: string;
  description: string;
  status: string;
  boleto_url?: string;
  barcode?: string;
  linha_digitavel?: string;
  stripe_payment_intent_id?: string;
}

interface PaymentOptionsCardProps {
  invoice: Invoice;
  onPaymentSuccess?: () => void;
}

export function PaymentOptionsCard({ invoice, onPaymentSuccess }: PaymentOptionsCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [generatedBoleto, setGeneratedBoleto] = useState<{
    url: string;
    linha_digitavel?: string;
  } | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      'pendente': { label: 'Pendente', variant: 'secondary' as const },
      'paga': { label: 'Paga', variant: 'default' as const },
      'vencida': { label: 'Vencida', variant: 'destructive' as const },
      'falha_pagamento': { label: 'Falha no Pagamento', variant: 'destructive' as const }
    };
    
    const statusInfo = statusMap[status as keyof typeof statusMap] || statusMap['pendente'];
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const createBoletoPayment = async () => {
    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-intent-connect', {
        body: {
          invoice_id: invoice.id,
          payment_method: 'boleto'
        }
      });

      if (error) throw error;

      if (data.boleto_url) {
        setGeneratedBoleto({
          url: data.boleto_url,
          linha_digitavel: data.linha_digitavel
        });
        
        const newWindow = window.open(data.boleto_url, '_blank');
        
        if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
          setPopupBlocked(true);
          toast({
            title: "Boleto gerado",
            description: "Use o botão abaixo para abrir o boleto (popup bloqueado)",
            variant: "default",
          });
        } else {
          toast({
            title: "Boleto gerado",
            description: "O boleto foi aberto em uma nova aba",
          });
          setPopupBlocked(false);
        }
        
        if (data.linha_digitavel && onPaymentSuccess) {
          setTimeout(() => onPaymentSuccess(), 1000);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Tente novamente mais tarde";
      console.error('Error creating boleto:', error);
      toast({
        title: "Erro ao gerar boleto",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyPaymentStatus = async () => {
    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('verify-payment-status', {
        body: {
          invoice_id: invoice.id
        }
      });

      if (error) throw error;

      if (data.updated) {
        toast({
          title: "Status atualizado",
          description: `Status da fatura: ${data.status === 'paga' ? 'Paga' : 'Pendente'}`,
        });
        onPaymentSuccess?.();
      } else {
        toast({
          title: "Status verificado",
          description: `Status atual: ${data.status === 'paga' ? 'Paga' : 'Pendente'}`,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Tente novamente mais tarde";
      console.error('Error verifying payment status:', error);
      toast({
        title: "Erro ao verificar status",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copiado!",
        description: `${label} copiado para a área de transferência`,
      });
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o texto",
        variant: "destructive",
      });
    }
  };

  const isOverdue = new Date(invoice.due_date) < new Date();
  const isPaid = invoice.status === 'paga';
  const isBelowMinimum = parseFloat(invoice.amount) < MINIMUM_BOLETO_AMOUNT;

  return (
    <StripeAccountGuard requireChargesEnabled={true}>
      <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            <span>Fatura - {invoice.description}</span>
          </div>
          {getStatusBadge(invoice.status)}
        </CardTitle>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{formatCurrency(invoice.amount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className={isOverdue && !isPaid ? "text-destructive font-medium" : ""}>
              Venc: {formatDate(invoice.due_date)}
            </span>
          </div>
        </div>
      </CardHeader>

      {!isPaid && (
        <CardContent className="space-y-4">
          <Separator />
          
          {isBelowMinimum && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                O valor desta fatura ({formatCurrency(invoice.amount)}) está abaixo do 
                mínimo de R$ {MINIMUM_BOLETO_AMOUNT.toFixed(2).replace('.', ',')} para geração de boleto. 
                Entre em contato com o professor.
              </AlertDescription>
            </Alert>
          )}
          
          <div>
            <div className="space-y-3">
              {/* Boleto Bancário */}
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="h-4 w-4" />
                  <span className="font-medium">Boleto Bancário</span>
                </div>
                
                {invoice.boleto_url ? (
                  <div className="space-y-2">
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg dark:bg-green-950/20 dark:border-green-800">
                      <p className="text-sm text-green-800 dark:text-green-400 font-medium mb-2">✓ Boleto disponível</p>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => window.open(invoice.boleto_url!, '_blank')}
                        className="w-full"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Baixar Boleto PDF
                      </Button>
                    </div>
                    
                    {invoice.linha_digitavel && (
                      <div className="p-2 bg-muted rounded text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Linha digitável:</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(invoice.linha_digitavel!, "Linha digitável")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <code className="text-xs break-all font-mono">{invoice.linha_digitavel}</code>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-muted/50 border rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Boleto não disponível. Entre em contato com o professor se necessário.
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Verification Button */}
            <div className="pt-3 border-t mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={verifyPaymentStatus}
                disabled={loading}
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {loading ? "Verificando..." : "Verificar Status do Pagamento"}
              </Button>
            </div>
          </div>

          {isOverdue && (
            <div className="p-3 border border-destructive/30 bg-destructive/5 rounded-lg">
              <p className="text-sm text-destructive">
                <Calendar className="h-4 w-4 inline mr-2" />
                Esta fatura está vencida. Entre em contato com seu professor se houver dúvidas.
              </p>
            </div>
          )}
        </CardContent>
      )}
      </Card>
    </StripeAccountGuard>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Receipt, 
  QrCode, 
  CreditCard, 
  Download, 
  Copy, 
  ExternalLink,
  Calendar,
  DollarSign
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Invoice {
  id: string;
  amount: string;
  due_date: string;
  description: string;
  status: string;
  boleto_url?: string;
  barcode?: string;
  linha_digitavel?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
  stripe_payment_intent_id?: string;
}

interface PaymentOptionsCardProps {
  invoice: Invoice;
  onPaymentSuccess?: () => void;
}

export function PaymentOptionsCard({ invoice, onPaymentSuccess }: PaymentOptionsCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activePaymentMethod, setActivePaymentMethod] = useState<string | null>(null);

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

  const createPaymentIntent = async (paymentMethod: string) => {
    setLoading(true);
    setActivePaymentMethod(paymentMethod);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-intent-connect', {
        body: {
          invoice_id: invoice.id,
          payment_method: paymentMethod
        }
      });

      if (error) throw error;

      if (paymentMethod === 'boleto' && data.boleto_url) {
        window.open(data.boleto_url, '_blank');
        toast({
          title: "Boleto gerado",
          description: "O boleto foi aberto em uma nova aba",
        });
        // Update local invoice data if linha_digitavel is returned
        if (data.linha_digitavel && onPaymentSuccess) {
          setTimeout(() => onPaymentSuccess(), 1000);
        }
      } else if (paymentMethod === 'card' && data.checkout_url) {
        window.open(data.checkout_url, '_blank');
        toast({
          title: "Redirecionando",
          description: "Você será redirecionado para o pagamento com cartão",
        });
      } else if (paymentMethod === 'pix' && data.pix_qr_code) {
        toast({
          title: "PIX gerado",
          description: "Use o QR code ou código PIX para pagar",
        });
        if (onPaymentSuccess) {
          setTimeout(() => onPaymentSuccess(), 1000);
        }
      }

    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      toast({
        title: "Erro ao processar pagamento",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setActivePaymentMethod(null);
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

    } catch (error: any) {
      console.error('Error verifying payment status:', error);
      toast({
        title: "Erro ao verificar status",
        description: error.message || "Tente novamente mais tarde",
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

  return (
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
            <span className={isOverdue && !isPaid ? "text-red-600 font-medium" : ""}>
              Venc: {formatDate(invoice.due_date)}
            </span>
          </div>
        </div>
      </CardHeader>

      {!isPaid && (
        <CardContent className="space-y-4">
          <Separator />
          
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Opções de Pagamento
            </h4>
            
            <div className="space-y-3">
              {/* Boleto Bancário */}
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    <span className="font-medium">Boleto Bancário</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => createPaymentIntent('boleto')}
                    disabled={loading && activePaymentMethod === 'boleto'}
                  >
                    {loading && activePaymentMethod === 'boleto' ? (
                      "Gerando..."
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Gerar Boleto
                      </>
                    )}
                  </Button>
                </div>
                
                {invoice.linha_digitavel && (
                  <div className="mt-2 p-2 bg-muted rounded text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Linha digitável:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(invoice.linha_digitavel!, "Linha digitável")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <code className="text-xs break-all">{invoice.linha_digitavel}</code>
                  </div>
                )}
              </div>

              {/* PIX */}
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-4 w-4" />
                    <span className="font-medium">PIX</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => createPaymentIntent('pix')}
                    disabled={loading && activePaymentMethod === 'pix'}
                  >
                    {loading && activePaymentMethod === 'pix' ? (
                      "Gerando..."
                    ) : (
                      <>
                        <QrCode className="h-4 w-4 mr-2" />
                        Gerar PIX
                      </>
                    )}
                  </Button>
                </div>
                
                {invoice.pix_qr_code && (
                  <div className="mt-2 p-2 bg-muted rounded text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Código PIX:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(invoice.pix_copy_paste || invoice.pix_qr_code!, "Código PIX")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <code className="text-xs break-all">{invoice.pix_copy_paste || invoice.pix_qr_code}</code>
                  </div>
                )}
              </div>

              {/* Cartão de Crédito */}
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span className="font-medium">Cartão de Crédito</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => createPaymentIntent('card')}
                    disabled={loading && activePaymentMethod === 'card'}
                  >
                    {loading && activePaymentMethod === 'card' ? (
                      "Processando..."
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Pagar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Verification Button */}
            <div className="pt-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={verifyPaymentStatus}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Verificando..." : "Verificar Status do Pagamento"}
              </Button>
            </div>
          </div>

          {isOverdue && (
            <div className="p-3 border border-red-200 bg-red-50 rounded-lg">
              <p className="text-sm text-red-800">
                <Calendar className="h-4 w-4 inline mr-2" />
                Esta fatura está vencida. Entre em contato com seu professor se houver dúvidas.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
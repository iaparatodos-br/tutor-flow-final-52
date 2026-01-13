import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { 
  Receipt, 
  QrCode, 
  CreditCard, 
  ExternalLink,
  Calendar,
  DollarSign,
  Copy,
  AlertTriangle,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MINIMUM_BOLETO_AMOUNT } from "@/utils/stripe-fees";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation('financial');
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activePaymentMethod, setActivePaymentMethod] = useState<string | null>(null);
  const [generatedBoleto, setGeneratedBoleto] = useState<{
    url: string;
    linha_digitavel?: string;
  } | null>(null);
  const [generatedPix, setGeneratedPix] = useState<{
    qr_code: string;
    copy_paste: string;
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
      'pendente': { label: t('status.pending'), variant: 'secondary' as const },
      'paga': { label: t('status.paid'), variant: 'default' as const },
      'vencida': { label: t('status.overdue'), variant: 'destructive' as const },
      'falha_pagamento': { label: t('status.overdue'), variant: 'destructive' as const }
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

      // Validate API response for validation errors
      if (data && data.success === false) {
        throw new Error(data.error || t('paymentOptions.paymentError'));
      }

      if (paymentMethod === 'boleto' && data.boleto_url) {
        setGeneratedBoleto({
          url: data.boleto_url,
          linha_digitavel: data.linha_digitavel
        });
        
        const newWindow = window.open(data.boleto_url, '_blank');
        
        if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
          setPopupBlocked(true);
          toast({
            title: t('paymentOptions.boletoGenerated'),
            description: t('paymentOptions.boletoPopupBlocked'),
            variant: "default",
          });
        } else {
          toast({
            title: t('paymentOptions.boletoGenerated'),
            description: t('paymentOptions.boletoOpenedNewTab'),
          });
          setPopupBlocked(false);
        }
        
        if (data.linha_digitavel && onPaymentSuccess) {
          setTimeout(() => onPaymentSuccess(), 1000);
        }
      } else if (paymentMethod === 'card' && data.checkout_url) {
        window.open(data.checkout_url, '_blank');
        toast({
          title: t('paymentOptions.redirecting'),
          description: t('paymentOptions.redirectingCard'),
        });
      } else if (paymentMethod === 'pix' && data.pix_qr_code) {
        // Store the generated PIX data so user can see and copy it
        setGeneratedPix({
          qr_code: data.pix_qr_code,
          copy_paste: data.pix_copy_paste || data.pix_qr_code
        });
        toast({
          title: t('paymentOptions.pixGenerated'),
          description: t('paymentOptions.pixGeneratedDescription'),
        });
        // Don't close modal - let user see and copy the PIX code
      }

    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      toast({
        title: t('paymentOptions.paymentError'),
        description: error.message || t('messages.loadError'),
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

      const statusLabel = data.status === 'paga' ? t('paymentOptions.statusPaid') : t('paymentOptions.statusPending');

      if (data.updated) {
        toast({
          title: t('paymentOptions.statusUpdated'),
          description: t('paymentOptions.statusDescription', { status: statusLabel }),
        });
        onPaymentSuccess?.();
      } else {
        toast({
          title: t('paymentOptions.statusVerified'),
          description: t('paymentOptions.currentStatus', { status: statusLabel }),
        });
      }

    } catch (error: any) {
      console.error('Error verifying payment status:', error);
      toast({
        title: t('paymentOptions.verifyError'),
        description: error.message || t('messages.loadError'),
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
        title: t('paymentOptions.copied'),
        description: t('paymentOptions.copiedDescription', { label }),
      });
    } catch (error) {
      toast({
        title: t('paymentOptions.copyError'),
        description: t('paymentOptions.copyErrorDescription'),
        variant: "destructive",
      });
    }
  };

  const isOverdue = new Date(invoice.due_date) < new Date();
  const isPaid = invoice.status === 'paga';
  // Limite mínimo de R$ 5,00 se aplica APENAS ao boleto, não ao PIX ou Cartão
  const isBelowBoletoMinimum = parseFloat(invoice.amount) < MINIMUM_BOLETO_AMOUNT;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            <span>{t('paymentOptions.invoiceTitle', { description: invoice.description })}</span>
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
              {t('paymentOptions.dueDate', { date: formatDate(invoice.due_date) })}
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
              {t('paymentOptions.title')}
            </h4>
            
            <div className="space-y-3">
              {/* PIX - Destacado como recomendado (menor taxa) - SEM limite mínimo */}
              <div className="p-3 border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="font-medium text-green-800 dark:text-green-200">PIX</span>
                    <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs">
                      {t('paymentOptions.pixBadge')}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => createPaymentIntent('pix')}
                    disabled={loading && activePaymentMethod === 'pix'}
                  >
                    {loading && activePaymentMethod === 'pix' ? (
                      t('paymentOptions.generating')
                    ) : (
                      <>
                        <QrCode className="h-4 w-4 mr-2" />
                        {t('paymentOptions.payWithPix')}
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                  {t('paymentOptions.pixDescription')}
                </p>
                
                {/* Show PIX code - either from invoice or newly generated */}
                {(invoice.pix_qr_code || generatedPix) && (
                  <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-green-200 dark:border-green-700">
                    {/* QR Code Visual - if available */}
                    {(generatedPix?.qr_code || invoice.pix_qr_code) && (
                      <div className="flex justify-center mb-3">
                        <div className="bg-white p-2 rounded">
                          <QRCodeSVG 
                            value={generatedPix?.qr_code || invoice.pix_qr_code!}
                            size={144}
                            level="M"
                            bgColor="#ffffff"
                            fgColor="#000000"
                          />
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t('paymentOptions.pixCode')}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(
                          generatedPix?.copy_paste || invoice.pix_copy_paste || invoice.pix_qr_code!, 
                          "PIX"
                        )}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        <span className="text-xs">{t('paymentOptions.copy')}</span>
                      </Button>
                    </div>
                    <code className="text-xs break-all block mt-1 p-2 bg-muted rounded">
                      {generatedPix?.copy_paste || invoice.pix_copy_paste || invoice.pix_qr_code}
                    </code>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t('paymentOptions.pixExpiration')}
                    </p>
                  </div>
                )}
              </div>

              {/* Boleto Bancário - COM limite mínimo de R$ 5,00 */}
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="h-4 w-4" />
                  <span className="font-medium">{t('paymentOptions.boleto')}</span>
                  <span className="text-xs text-muted-foreground">{t('paymentOptions.boletoFeeNote')}</span>
                </div>
                
                {/* Alerta de valor mínimo - APENAS para boleto */}
                {isBelowBoletoMinimum && (
                  <Alert variant="default" className="mb-2 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
                      {t('paymentOptions.boletoMinimumWarning')}
                    </AlertDescription>
                  </Alert>
                )}
                
              {/* Show existing boleto or newly generated boleto */}
                {(invoice.boleto_url || generatedBoleto) && !isBelowBoletoMinimum ? (
                  <div className="space-y-2">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-200 font-medium mb-2">{t('paymentOptions.boletoAvailable')}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(generatedBoleto?.url || invoice.boleto_url!, '_blank')}
                        className="w-full"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t('paymentOptions.downloadBoleto')}
                      </Button>
                    </div>
                    
                    {(generatedBoleto?.linha_digitavel || invoice.linha_digitavel) && (
                      <div className="p-2 bg-muted rounded text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">{t('paymentOptions.digitableLine')}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(
                              generatedBoleto?.linha_digitavel || invoice.linha_digitavel!, 
                              t('paymentOptions.digitableLine')
                            )}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <code className="text-xs break-all font-mono">
                          {generatedBoleto?.linha_digitavel || invoice.linha_digitavel}
                        </code>
                      </div>
                    )}
                  </div>
                ) : !isBelowBoletoMinimum ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createPaymentIntent('boleto')}
                    disabled={loading && activePaymentMethod === 'boleto'}
                    className="w-full"
                  >
                    {loading && activePaymentMethod === 'boleto' ? (
                      t('paymentOptions.generating')
                    ) : (
                      <>
                        <Receipt className="h-4 w-4 mr-2" />
                        {t('paymentOptions.generateBoleto')}
                      </>
                    )}
                  </Button>
                ) : null}
              </div>

              {/* Cartão de Crédito - SEM limite mínimo */}
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span className="font-medium">{t('paymentOptions.creditCard')}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => createPaymentIntent('card')}
                    disabled={loading && activePaymentMethod === 'card'}
                  >
                    {loading && activePaymentMethod === 'card' ? (
                      t('paymentOptions.processing')
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t('paymentOptions.pay')}
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
                {loading ? t('paymentOptions.verifying') : t('paymentOptions.verifyStatus')}
              </Button>
            </div>
          </div>

          {isOverdue && (
            <div className="p-3 border border-red-200 bg-red-50 rounded-lg">
              <p className="text-sm text-red-800">
                <Calendar className="h-4 w-4 inline mr-2" />
                {t('paymentOptions.overdueWarning')}
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
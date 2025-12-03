import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Copy,
  ExternalLink,
  Clock,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface PendingBoletoData {
  boletoUrl?: string;
  dueDate?: string;
  barcode?: string;
  amount?: number;
}

interface PendingBoletoModalProps {
  open: boolean;
  onDismiss: () => void;
  boletoData: PendingBoletoData | null;
  onRefresh?: () => Promise<void>;
}

export function PendingBoletoModal({
  open,
  onDismiss,
  boletoData,
  onRefresh,
}: PendingBoletoModalProps) {
  const { t } = useTranslation("subscription");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return t("pendingBoleto.dateUndefined", "Data não definida");
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatCurrency = (value?: number) => {
    if (!value) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const handleCopyBarcode = async () => {
    if (boletoData?.barcode) {
      try {
        await navigator.clipboard.writeText(boletoData.barcode);
        toast.success(t("pendingBoleto.barcodeCopied", "Código de barras copiado!"));
      } catch {
        toast.error(t("pendingBoleto.copyError", "Erro ao copiar"));
      }
    }
  };

  const handleDownloadBoleto = () => {
    if (boletoData?.boletoUrl) {
      window.open(boletoData.boletoUrl, "_blank");
    }
  };

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      try {
        await onRefresh();
        toast.success(t("pendingBoleto.statusChecked", "Status verificado!"));
      } catch {
        toast.error(t("pendingBoleto.checkError", "Erro ao verificar status"));
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {t("pendingBoleto.title", "Aguardando Pagamento do Boleto")}
              </DialogTitle>
              <Badge variant="outline" className="mt-1 border-amber-500 text-amber-600">
                <Clock className="mr-1 h-3 w-3" />
                {t("pendingBoleto.status", "Aguardando compensação")}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <DialogDescription className="text-base">
            {t(
              "pendingBoleto.description",
              "Seu boleto foi gerado e está aguardando compensação bancária."
            )}
          </DialogDescription>

          {/* Payment Details */}
          <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/20">
            <CardContent className="p-4 space-y-3">
              {boletoData?.dueDate && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {t("pendingBoleto.dueDate", "Vencimento")}
                  </span>
                  <span className="font-medium">{formatDate(boletoData.dueDate)}</span>
                </div>
              )}
              {boletoData?.amount && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {t("pendingBoleto.amount", "Valor")}
                  </span>
                  <span className="font-medium">{formatCurrency(boletoData.amount)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Barcode */}
          {boletoData?.barcode && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t("pendingBoleto.barcode", "Código de Barras")}
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted p-3 text-xs font-mono break-all">
                  {boletoData.barcode}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyBarcode}
                  title={t("pendingBoleto.copyBarcode", "Copiar Código de Barras")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            {boletoData?.boletoUrl && (
              <Button
                onClick={handleDownloadBoleto}
                className="flex-1"
                variant="default"
              >
                <FileText className="mr-2 h-4 w-4" />
                {t("pendingBoleto.downloadBoleto", "Baixar Boleto")}
                <ExternalLink className="ml-2 h-3 w-3" />
              </Button>
            )}
            <Button
              onClick={handleRefresh}
              variant="outline"
              disabled={isRefreshing}
              className="flex-1"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {t("pendingBoleto.checkStatus", "Verificar Status")}
            </Button>
          </div>

          <Separator />

          {/* Info Alert */}
          <div className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 border border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">
                {t("pendingBoleto.processingTimeTitle", "Tempo de compensação")}
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                {t(
                  "pendingBoleto.processingTime",
                  "O boleto pode levar de 1 a 3 dias úteis para ser compensado após o pagamento."
                )}
              </p>
            </div>
          </div>

          {/* Access Granted Notice */}
          <div className="flex items-start gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 p-4 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-800 dark:text-green-200">
              <p className="font-medium mb-1">
                {t("pendingBoleto.accessGrantedTitle", "Acesso liberado")}
              </p>
              <p className="text-green-700 dark:text-green-300">
                {t(
                  "pendingBoleto.accessGranted",
                  "Enquanto isso, você já pode usar todas as funcionalidades do seu plano!"
                )}
              </p>
            </div>
          </div>

          {/* Dismiss Button */}
          <Button
            onClick={onDismiss}
            variant="ghost"
            className="w-full"
          >
            {t("pendingBoleto.dismiss", "Entendi")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

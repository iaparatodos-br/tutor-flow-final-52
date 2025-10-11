import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CreditCard, AlertCircle, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UpdatePaymentMethodModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorMessage: string;
  onRetry: () => void;
}

export function UpdatePaymentMethodModal({
  open,
  onOpenChange,
  errorMessage,
  onRetry
}: UpdatePaymentMethodModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleUpdatePaymentMethod = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');

      if (error) throw error;

      if (data?.url) {
        // Open Stripe Customer Portal in new window
        const portalWindow = window.open(data.url, '_blank', 'width=800,height=800');
        
        if (!portalWindow) {
          toast({
            title: 'Pop-up bloqueado',
            description: 'Por favor, permita pop-ups para atualizar o método de pagamento',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Portal de pagamento aberto',
            description: 'Atualize seu método de pagamento e tente adicionar o aluno novamente',
          });
          
          // Close modal after opening portal
          onOpenChange(false);
        }
      }
    } catch (error: any) {
      console.error('Error opening customer portal:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível abrir o portal de pagamento',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Falha no Pagamento
          </DialogTitle>
          <DialogDescription>
            Não foi possível processar o pagamento para adicionar este aluno
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Para adicionar alunos extras ao seu plano, você precisa ter um método de pagamento válido configurado.
          </p>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleUpdatePaymentMethod}
              disabled={loading}
              className="w-full"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {loading ? 'Abrindo portal...' : 'Atualizar Método de Pagamento'}
              <ExternalLink className="ml-2 h-3 w-3" />
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onRetry();
              }}
              className="w-full"
            >
              Tentar Novamente
            </Button>

            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Heart, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AmnestyButtonProps {
  classId: string;
  studentName: string;
  onAmnestyGranted: () => void;
  disabled?: boolean;
}

export function AmnestyButton({ classId, studentName, onAmnestyGranted, disabled }: AmnestyButtonProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGrantAmnesty = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      // Start a transaction-like approach
      // First, update the class
      const { error: classError } = await supabase
        .from('classes')
        .update({
          status: 'cancelada_sem_cobranca',
          amnesty_granted: true,
          amnesty_granted_by: profile.id,
          amnesty_granted_at: new Date().toISOString(),
          charge_applied: false
        })
        .eq('id', classId);

      if (classError) throw classError;

      // Then, update or cancel the related invoice
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          status: 'cancelada',
          description: `[ANISTIADA] ${justification ? `Motivo: ${justification}` : 'Anistia concedida pelo professor'}`
        })
        .eq('class_id', classId)
        .eq('invoice_type', 'cancellation');

      if (invoiceError) {
        console.error('Error updating invoice:', invoiceError);
        // Don't throw here as class update was successful
      }

      toast({
        title: "Anistia Concedida",
        description: `A cobrança de cancelamento para ${studentName} foi removida.`,
      });

      onAmnestyGranted();
      setIsOpen(false);
      setJustification("");
    } catch (error) {
      console.error('Error granting amnesty:', error);
      toast({
        title: "Erro",
        description: "Não foi possível conceder a anistia. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2"
        >
          <Heart className="h-4 w-4" />
          Anistia
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            Conceder Anistia
          </DialogTitle>
          <DialogDescription>
            Você está prestes a remover a cobrança de cancelamento para <strong>{studentName}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Esta ação:</strong><br />
              • Remove a cobrança de cancelamento<br />
              • Altera o status para "Cancelada sem Cobrança"<br />
              • Cancela a fatura relacionada<br />
              • Não pode ser desfeita
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="justification">Justificativa (opcional)</Label>
            <Textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex: Problema técnico, emergência médica, caso fortuito..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            variant="destructive"
            onClick={handleGrantAmnesty} 
            disabled={loading}
          >
            {loading ? "Concedendo..." : "Conceder Anistia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
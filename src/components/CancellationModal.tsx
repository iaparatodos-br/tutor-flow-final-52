import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Clock, DollarSign } from "lucide-react";

interface CancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  classDate: string;
  onCancellationComplete: () => void;
}

interface CancellationPolicy {
  hours_before_class: number;
  charge_percentage: number;
  allow_amnesty: boolean;
}

export function CancellationModal({ 
  isOpen, 
  onClose, 
  classId, 
  className, 
  classDate,
  onCancellationComplete 
}: CancellationModalProps) {
  const { profile, isProfessor } = useAuth();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<CancellationPolicy | null>(null);
  const [willBeCharged, setWillBeCharged] = useState(false);
  const [chargeAmount, setChargeAmount] = useState(0);
  const [hoursUntilClass, setHoursUntilClass] = useState(0);

  useEffect(() => {
    if (isOpen && classId) {
      loadPolicyAndCalculateCharge();
    }
  }, [isOpen, classId]);

  const loadPolicyAndCalculateCharge = async () => {
    try {
      // Get class details to find teacher
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('teacher_id, class_date')
        .eq('id', classId)
        .single();

      if (classError || !classData) return;

      // Get teacher's policy
      const { data: policyData, error: policyError } = await supabase
        .from('cancellation_policies')
        .select('*')
        .eq('teacher_id', classData.teacher_id)
        .eq('is_active', true)
        .maybeSingle();

      if (policyError && policyError.code !== 'PGRST116') {
        console.error('Policy error:', policyError);
        return;
      }

      const currentPolicy = policyData || {
        hours_before_class: 24,
        charge_percentage: 0,
        allow_amnesty: true
      };

      setPolicy(currentPolicy);

      // Calculate charge
      const classDateTime = new Date(classData.class_date);
      const now = new Date();
      const hoursUntil = (classDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      setHoursUntilClass(hoursUntil);

      // Only students get charged for late cancellations
      if (!isProfessor && hoursUntil < currentPolicy.hours_before_class && currentPolicy.charge_percentage > 0) {
        setWillBeCharged(true);
        const baseAmount = 100; // This should come from class data
        setChargeAmount((baseAmount * currentPolicy.charge_percentage) / 100);
      } else {
        setWillBeCharged(false);
        setChargeAmount(0);
      }
    } catch (error) {
      console.error('Error loading policy:', error);
    }
  };

  const handleCancel = async () => {
    if (!reason.trim()) {
      toast({
        title: "Erro",
        description: "O motivo do cancelamento é obrigatório.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-cancellation', {
        body: {
          class_id: classId,
          cancelled_by: profile!.id,
          reason: reason.trim(),
          cancelled_by_type: isProfessor ? 'teacher' : 'student'
        }
      });

      if (error) throw error;

      toast({
        title: "Aula Cancelada",
        description: data.message,
        variant: data.charged ? "destructive" : "default",
      });

      onCancellationComplete();
      onClose();
      setReason("");
    } catch (error) {
      console.error('Error cancelling class:', error);
      toast({
        title: "Erro",
        description: "Não foi possível cancelar a aula. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar Aula</DialogTitle>
          <DialogDescription>
            {className} - {new Date(classDate).toLocaleDateString()} às {new Date(classDate).toLocaleTimeString()}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {policy && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                <span>
                  Faltam {Math.max(0, Math.round(hoursUntilClass))} horas para a aula
                </span>
              </div>

              {willBeCharged ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Atenção!</strong> Este cancelamento será cobrado.<br />
                    • Prazo limite: {policy.hours_before_class}h antes da aula<br />
                    • Valor da cobrança: R$ {chargeAmount.toFixed(2)} ({policy.charge_percentage}% do valor da aula)
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <DollarSign className="h-4 w-4" />
                  <AlertDescription>
                    Este cancelamento não gerará cobrança.
                    {!isProfessor && policy.hours_before_class && (
                      <span> (Cancelamento dentro do prazo de {policy.hours_before_class}h)</span>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo do cancelamento *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo do cancelamento..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Voltar
          </Button>
          <Button 
            variant={willBeCharged ? "destructive" : "default"}
            onClick={handleCancel} 
            disabled={loading || !reason.trim()}
          >
            {loading ? "Cancelando..." : willBeCharged ? "Cancelar com Cobrança" : "Cancelar Aula"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
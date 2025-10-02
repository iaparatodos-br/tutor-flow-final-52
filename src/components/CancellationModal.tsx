import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/contexts/SubscriptionContext";
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
  const { hasTeacherFeature } = useSubscription();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<CancellationPolicy | null>(null);
  const [willBeCharged, setWillBeCharged] = useState(false);
  const [chargeAmount, setChargeAmount] = useState(0);
  const [hoursUntilClass, setHoursUntilClass] = useState(0);

  // Check if teacher has financial module
  const teacherHasFinancialModule = hasTeacherFeature('financial_module');

  useEffect(() => {
    if (isOpen && classId) {
      // Clear previous policy data to ensure fresh load
      setPolicy(null);
      loadPolicyAndCalculateCharge();
    }
  }, [isOpen, classId]);

  const loadPolicyAndCalculateCharge = async () => {
    try {
      // Get class details with service information
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(`
          teacher_id, 
          class_date, 
          service_id,
          class_services(price)
        `)
        .eq('id', classId)
        .maybeSingle();

      if (classError || !classData) {
        console.error('Error loading class data:', classError);
        return;
      }

      // Get teacher's policy - always fetch fresh data
      const { data: policyData, error: policyError } = await supabase
        .from('cancellation_policies')
        .select('*')
        .eq('teacher_id', classData.teacher_id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .maybeSingle();

      if (policyError && policyError.code !== 'PGRST116') {
        console.error('Policy error:', policyError);
        return;
      }

      // Use default policy if none exists
      const currentPolicy = policyData || {
        hours_before_class: 24,
        charge_percentage: 50,
        allow_amnesty: true
      };

      console.log('Loaded policy:', currentPolicy);
      setPolicy(currentPolicy);

      // Calculate charge
      const classDateTime = new Date(classData.class_date);
      const now = new Date();
      const hoursUntil = (classDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      setHoursUntilClass(hoursUntil);

      // Only students get charged for late cancellations AND only if teacher has financial module
      if (!isProfessor && teacherHasFinancialModule && hoursUntil < currentPolicy.hours_before_class && currentPolicy.charge_percentage > 0) {
        setWillBeCharged(true);
        // Use actual service price or default to 100
        const baseAmount = classData.class_services?.price || 100;
        setChargeAmount((Number(baseAmount) * currentPolicy.charge_percentage) / 100);
      } else {
        setWillBeCharged(false);
        setChargeAmount(0);
      }
    } catch (error) {
      console.error('Error loading policy:', error);
      // Set default policy on error
      setPolicy({
        hours_before_class: 24,
        charge_percentage: 50,
        allow_amnesty: true
      });
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
            {className} - {new Date(classDate).toLocaleDateString()} às {new Date(classDate).toLocaleTimeString()} (Horário de Brasília)
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {policy && (
            <div className="space-y-3">
              {/* Status da aula */}
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" />
                <span>
                  Faltam {Math.max(0, Math.round(hoursUntilClass))} horas para a aula
                </span>
              </div>

              {/* Política de cancelamento */}
              <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-1">
                <div className="font-medium text-foreground">Política de Cancelamento:</div>
                <div>• Prazo limite para cancelamento gratuito: <strong>{policy.hours_before_class}h</strong> antes da aula</div>
                {teacherHasFinancialModule && policy.charge_percentage > 0 && (
                  <div>• Cobrança por cancelamento tardio: <strong>{policy.charge_percentage}%</strong> do valor da aula</div>
                )}
                {teacherHasFinancialModule && policy.allow_amnesty && (
                  <div>• O professor pode conceder amnistia em casos especiais</div>
                )}
              </div>

              {/* Alerta sobre cobrança */}
              {willBeCharged && teacherHasFinancialModule ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>⚠️ Cancelamento com Cobrança</strong><br />
                    O prazo limite de {policy.hours_before_class}h já passou.<br />
                    <strong>Valor da cobrança: R$ {chargeAmount.toFixed(2)}</strong><br />
                    <small>A cobrança será incluída na próxima fatura mensal.</small>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    <strong>✅ Cancelamento Gratuito</strong><br />
                    {isProfessor ? 
                      "Professores podem cancelar aulas sem cobrança." :
                      teacherHasFinancialModule ?
                        `Cancelamento realizado dentro do prazo de ${policy.hours_before_class}h.` :
                        "Cancelamento sem cobrança - sistema de cobrança não disponível."
                    }
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
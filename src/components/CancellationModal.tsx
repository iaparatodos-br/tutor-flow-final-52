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
import { useTranslation } from "react-i18next";

interface VirtualClassData {
  teacher_id: string;
  class_date: string;
  service_id: string | null;
  is_group_class: boolean;
  service_price: number | null;
  class_template_id: string;
  duration_minutes: number;
  // student_id REMOVED - use class_participants instead
}

interface CancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  classDate: string;
  onCancellationComplete: () => void;
  virtualClassData?: VirtualClassData;
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
  onCancellationComplete,
  virtualClassData
}: CancellationModalProps) {
  const { profile, isProfessor } = useAuth();
  const { hasTeacherFeature } = useSubscription();
  const { toast } = useToast();
  const { t } = useTranslation('cancellation');
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<CancellationPolicy | null>(null);
  const [willBeCharged, setWillBeCharged] = useState(false);
  const [chargeAmount, setChargeAmount] = useState(0);
  const [hoursUntilClass, setHoursUntilClass] = useState(0);
  const [classData, setClassData] = useState<{ 
    is_group_class: boolean;
    class_date: string;
    class_services: any;
  } | null>(null);

  // Check if teacher has financial module
  const teacherHasFinancialModule = hasTeacherFeature('financial_module');

  useEffect(() => {
    if (isOpen && classId) {
      // Clear previous data to ensure fresh load
      setPolicy(null);
      setClassData(null);
      loadPolicyAndCalculateCharge();
    }
  }, [isOpen, classId]);

  const loadPolicyAndCalculateCharge = async () => {
    try {
      let fetchedClassData;
      
      // If virtualClassData is provided, use it instead of fetching from DB
      if (virtualClassData) {
        fetchedClassData = {
          teacher_id: virtualClassData.teacher_id,
          class_date: virtualClassData.class_date,
          service_id: virtualClassData.service_id,
          is_group_class: virtualClassData.is_group_class,
          class_services: virtualClassData.service_price ? { price: virtualClassData.service_price } : null
        };
        
        setClassData({ 
          is_group_class: fetchedClassData.is_group_class,
          class_date: fetchedClassData.class_date,
          class_services: fetchedClassData.class_services
        });
      } else {
        // Normal behavior: fetch from database
        const { data, error: classError } = await supabase
          .from('classes')
          .select(`
            teacher_id, 
            class_date, 
            service_id,
            is_group_class,
            class_services(price)
          `)
          .eq('id', classId)
          .maybeSingle();

        if (classError || !data) {
          console.error('Error loading class data:', classError);
          return;
        }
        
        fetchedClassData = data;
        
        setClassData({ 
          is_group_class: fetchedClassData.is_group_class,
          class_date: fetchedClassData.class_date,
          class_services: fetchedClassData.class_services
        });
      }

      // Get teacher's policy - always fetch fresh data
      const { data: policyData, error: policyError } = await supabase
        .from('cancellation_policies')
        .select('*')
        .eq('teacher_id', fetchedClassData.teacher_id)
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

      // Calculate charge - using fetchedClassData instead of classData to avoid null reference
      const classDateTime = new Date(fetchedClassData.class_date);
      const now = new Date();
      const hoursUntil = (classDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      setHoursUntilClass(hoursUntil);

      // Only students get charged for late cancellations AND only if teacher has financial module
      if (!isProfessor && teacherHasFinancialModule && hoursUntil < currentPolicy.hours_before_class && currentPolicy.charge_percentage > 0) {
        setWillBeCharged(true);
        // Use actual service price or default to 100
        const baseAmount = fetchedClassData.class_services?.price || 100;
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
        title: t('messages.error'),
        description: t('fields.reasonRequired'),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      let finalClassId = classId;
      
      // If it's a virtual class, materialize it first via Edge Function
      if (virtualClassData) {
        console.log('Materializing virtual class before cancellation...');
        
        try {
          const { data: materializationResult, error: materializeError } = await supabase.functions.invoke(
            'materialize-virtual-class',
            {
              body: {
                template_id: virtualClassData.class_template_id,
                class_date: virtualClassData.class_date,
                cancellation_reason: reason.trim()
              }
            }
          );

          if (materializeError || !materializationResult?.success) {
            console.error('Error materializing class:', materializeError);
            throw new Error('Failed to materialize virtual class');
          }

          finalClassId = materializationResult.materialized_class_id;
          console.log('Virtual class materialized via Edge Function:', finalClassId, 'Participants:', materializationResult.participants_count);
        } catch (error) {
          console.error('Error materializing class:', error);
          toast({
            title: t('messages.error'),
            description: t('cancellation.feedback.error'),
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }
      
      // Now call the edge function with the materialized class ID
      const { data, error } = await supabase.functions.invoke('process-cancellation', {
        body: {
          class_id: finalClassId,
          cancelled_by: profile!.id,
          reason: reason.trim(),
          cancelled_by_type: isProfessor ? 'teacher' : 'student'
        }
      });

      if (error) throw error;

      // Enviar notificação de cancelamento
      try {
        await supabase.functions.invoke('send-cancellation-notification', {
          body: {
            class_id: finalClassId,
            cancelled_by_type: isProfessor ? 'teacher' : 'student',
            cancellation_reason: reason.trim() || null,
            charge_applied: data?.charge_applied || false,
            is_group_class: classData?.is_group_class || false
          }
        });
        console.log('📧 Cancellation notification sent');
      } catch (notifError) {
        console.error('❌ Failed to send cancellation notification:', notifError);
        // Não falhar a operação se a notificação falhar
      }

      toast({
        title: t('messages.success'),
        description: data.message,
        variant: data.charged ? "destructive" : "default",
      });

      onCancellationComplete();
      onClose();
      setReason("");
    } catch (error) {
      console.error('Error cancelling class:', error);
      toast({
        title: t('messages.error'),
        description: t('messages.errorDescription'),
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
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {className} - {new Date(classDate).toLocaleDateString()} {t('at')} {new Date(classDate).toLocaleTimeString()} {t('timezone')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {policy && (
            <div className="space-y-3">
              {/* Status da aula */}
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" />
                <span>
                  {t('status.hoursUntil', { hours: Math.max(0, Math.round(hoursUntilClass)) })}
                </span>
              </div>

              {/* Política de cancelamento */}
              <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-1">
                <div className="font-medium text-foreground">{t('policy.title')}</div>
                <div>• {t('policy.freeDeadline')}: <strong>{t('policy.hours', { hours: policy.hours_before_class })}</strong> {t('policy.beforeClass')}</div>
                {teacherHasFinancialModule && policy.charge_percentage > 0 && (
                  <div>• {t('policy.lateCharge')}: <strong>{t('policy.percentage', { percentage: policy.charge_percentage })}</strong> {t('policy.ofValue')}</div>
                )}
                {teacherHasFinancialModule && policy.allow_amnesty && (
                  <div>• {t('policy.amnestyAvailable')}</div>
                )}
              </div>

              {/* Alerta sobre cobrança */}
              {willBeCharged && teacherHasFinancialModule ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{t('alert.withCharge.title')}</strong><br />
                    {t('alert.withCharge.deadlinePassed', { hours: policy.hours_before_class })}<br />
                    <strong>{t('alert.withCharge.chargeAmount', { amount: chargeAmount.toFixed(2) })}</strong><br />
                    <small>{t('alert.withCharge.nextInvoice')}</small>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    <strong>{t('alert.free.title')}</strong><br />
                    {isProfessor ? 
                      t('alert.free.professor') :
                      teacherHasFinancialModule ?
                        t('alert.free.withinDeadline', { hours: policy.hours_before_class }) :
                        t('alert.free.systemUnavailable')
                    }
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          
          {classData?.is_group_class && !isProfessor && (
            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription>
                <div className="flex items-center gap-2">
                  <div>
                    <strong>{t('alert.groupClass.title')}</strong>
                    <p className="text-sm mt-1">
                      {t('alert.groupClass.description')}
                      {willBeCharged && (
                        <span className="text-orange-600 font-semibold">
                          {' '}{t('alert.groupClass.chargeApplied')}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">{t('fields.reason')} *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('fields.reasonPlaceholder')}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t('actions.back')}
          </Button>
          <Button 
            variant={willBeCharged ? "destructive" : "default"}
            onClick={handleCancel} 
            disabled={loading || !reason.trim()}
          >
            {loading ? t('actions.canceling') : willBeCharged ? t('actions.cancelWithCharge') : t('actions.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
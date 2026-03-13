import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { HandHeart, AlertCircle, Ban } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

interface AmnestyButtonProps {
  classId: string;
  studentName: string;
  onAmnestyGranted: () => void;
  disabled?: boolean;
  /** When provided, amnesty is granted at participant level (group classes) */
  participantId?: string;
  /** Student ID for the participant - used to cancel the correct invoice */
  studentId?: string;
  /** Dependent ID - used to cancel the correct invoice for a dependent */
  dependentId?: string;
  /** Render variant: "default" (full button) or "compact" (icon-only with tooltip) */
  variant?: "default" | "compact";
}

export function AmnestyButton({ classId, studentName, onAmnestyGranted, disabled, participantId, studentId, dependentId, variant = "default" }: AmnestyButtonProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation('amnesty');
  const [isOpen, setIsOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [loading, setLoading] = useState(false);
  const [isBilled, setIsBilled] = useState(false);
  const [checkingBilling, setCheckingBilling] = useState(true);

  // Check if this class/participant has already been billed
  useEffect(() => {
    const checkBillingStatus = async () => {
      setCheckingBilling(true);
      try {
        let query = supabase
          .from('invoice_classes')
          .select('id, invoice_id, invoices!inner(id, status)')
          .eq('class_id', classId)
          .neq('invoices.status', 'cancelada')
          .limit(1);

        // If participant-level, filter by participant_id
        if (participantId) {
          query = query.eq('participant_id', participantId);
        }

        const { data, error } = await query;

        if (!error && data && data.length > 0) {
          setIsBilled(true);
        }
      } catch (err) {
        console.error('Error checking billing status:', err);
      } finally {
        setCheckingBilling(false);
      }
    };

    checkBillingStatus();
  }, [classId, participantId]);

  const isDisabled = disabled || isBilled || checkingBilling;

  const handleGrantAmnesty = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      if (participantId) {
        // Participant-level amnesty (group classes)
        const { error: participantError } = await supabase
          .from('class_participants')
          .update({
            charge_applied: false,
            amnesty_granted: true,
            amnesty_granted_by: profile.id,
            amnesty_granted_at: new Date().toISOString(),
          })
          .eq('id', participantId);

        if (participantError) throw participantError;

        // Cancel the specific cancellation invoice for this student + class
        if (studentId) {
          // When dependent is involved, find invoice via invoice_classes (which has dependent_id)
          if (dependentId) {
            const { data: invoiceItems } = await supabase
              .from('invoice_classes')
              .select('invoice_id, invoices!inner(id, status, invoice_type)')
              .eq('class_id', classId)
              .eq('dependent_id', dependentId)
              .eq('invoices.invoice_type', 'cancellation')
              .neq('invoices.status', 'cancelada');

            if (invoiceItems && invoiceItems.length > 0) {
              const invoiceIds = [...new Set(invoiceItems.map((item: any) => item.invoice_id))];
              const { error: invoiceError } = await supabase
                .from('invoices')
                .update({
                  status: 'cancelada',
                  description: `[ANISTIADA] ${justification ? `${t('fields.justification.label')}: ${justification}` : t('messages.success.description', { studentName })}`
                })
                .in('id', invoiceIds);

              if (invoiceError) {
                console.error('Error updating invoice:', invoiceError);
              }
            }
          } else {
            const { error: invoiceError } = await supabase
              .from('invoices')
              .update({
                status: 'cancelada',
                description: `[ANISTIADA] ${justification ? `${t('fields.justification.label')}: ${justification}` : t('messages.success.description', { studentName })}`
              })
              .eq('class_id', classId)
              .eq('student_id', studentId)
              .eq('invoice_type', 'cancellation');

            if (invoiceError) {
              console.error('Error updating invoice:', invoiceError);
            }
          }
        }
      } else {
        // Class-level amnesty (individual classes - legacy behavior)
        const { error: classError } = await supabase
          .from('classes')
          .update({
            amnesty_granted: true,
            amnesty_granted_by: profile.id,
            amnesty_granted_at: new Date().toISOString(),
            charge_applied: false
          })
          .eq('id', classId);

        if (classError) throw classError;

        // Also update the single participant if exists
        const { error: partError } = await supabase
          .from('class_participants')
          .update({
            charge_applied: false,
            amnesty_granted: true,
            amnesty_granted_by: profile.id,
            amnesty_granted_at: new Date().toISOString(),
          })
          .eq('class_id', classId)
          .eq('charge_applied', true);

        if (partError) {
          console.error('Error updating participant:', partError);
        }

        const { error: invoiceError } = await supabase
          .from('invoices')
          .update({
            status: 'cancelada',
            description: `[ANISTIADA] ${justification ? `${t('fields.justification.label')}: ${justification}` : t('messages.success.description', { studentName })}`
          })
          .eq('class_id', classId)
          .eq('invoice_type', 'cancellation');

        if (invoiceError) {
          console.error('Error updating invoice:', invoiceError);
        }
      }

      toast({
        title: t('messages.success.title'),
        description: t('messages.success.description', { studentName }),
      });

      onAmnestyGranted();
      setIsOpen(false);
      setJustification("");
    } catch (error) {
      console.error('Error granting amnesty:', error);
      toast({
        title: t('messages.error.title'),
        description: t('messages.error.description'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // If billed, show disabled button with tooltip
  if (isBilled) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button
                variant="outline"
                size="lg"
                disabled
                className="w-full h-12 border-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted hover:text-foreground text-base font-semibold gap-2"
              >
                <Ban className="h-5 w-5" />
                {t('button')}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('billedTooltip')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          disabled={isDisabled}
          className="w-full h-12 border-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted hover:text-foreground text-base font-semibold gap-2"
        >
          <HandHeart className="h-5 w-5" />
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandHeart className="h-5 w-5 text-red-500" />
            {t('title')}
          </DialogTitle>
          <DialogDescription dangerouslySetInnerHTML={{ __html: t('description', { studentName }) }} />
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('alert.title')}</strong><br />
              • {t('alert.removes')}<br />
              • {t('alert.changes')}<br />
              • {t('alert.cancels')}<br />
              • {t('alert.irreversible')}
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="justification">{t('fields.justification.label')}</Label>
            <Textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={t('fields.justification.placeholder')}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>
            {t('actions.cancel')}
          </Button>
          <Button 
            variant="destructive"
            onClick={handleGrantAmnesty} 
            disabled={loading}
          >
            {loading ? t('actions.granting') : t('actions.grant')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
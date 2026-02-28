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
}

export function AmnestyButton({ classId, studentName, onAmnestyGranted, disabled }: AmnestyButtonProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation('amnesty');
  const [isOpen, setIsOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [loading, setLoading] = useState(false);
  const [isBilled, setIsBilled] = useState(false);
  const [checkingBilling, setCheckingBilling] = useState(true);

  // Check if this class has already been billed (exists in invoice_classes with a non-cancelled invoice)
  useEffect(() => {
    const checkBillingStatus = async () => {
      setCheckingBilling(true);
      try {
        const { data, error } = await supabase
          .from('invoice_classes')
          .select('id, invoice_id, invoices!inner(id, status)')
          .eq('class_id', classId)
          .neq('invoices.status', 'cancelada')
          .limit(1);

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
  }, [classId]);

  const isDisabled = disabled || isBilled || checkingBilling;

  const handleGrantAmnesty = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
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
                size="default"
                disabled
                className="gap-2"
              >
                <Ban className="h-4 w-4" />
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
          size="default"
          disabled={isDisabled}
          className="gap-2"
        >
          <HandHeart className="h-4 w-4" />
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
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

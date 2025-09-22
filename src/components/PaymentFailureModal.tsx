import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CreditCard, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PaymentFailureModalProps {
  open: boolean;
  onRenewSubscription: () => void;
  onDowngradeToFree: () => void;
  failureDetails?: {
    lastFailureDate?: string;
    attemptsCount?: number;
    nextAttempt?: string;
  };
}

export function PaymentFailureModal({
  open,
  onRenewSubscription,
  onDowngradeToFree,
  failureDetails
}: PaymentFailureModalProps) {
  const { t } = useTranslation('subscription');

  return (
    <Dialog open={open} modal>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            {t('paymentFailure.title')}
          </DialogTitle>
          <DialogDescription>
            {t('paymentFailure.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('paymentFailure.explanation')}
            </AlertDescription>
          </Alert>

          {failureDetails && (
            <div className="space-y-2 text-sm text-muted-foreground">
              {failureDetails.lastFailureDate && (
                <p>
                  <strong>{t('paymentFailure.lastFailure')}:</strong>{' '}
                  {new Date(failureDetails.lastFailureDate).toLocaleString()}
                </p>
              )}
              {failureDetails.attemptsCount && (
                <p>
                  <strong>{t('paymentFailure.attempts')}:</strong> {failureDetails.attemptsCount}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="text-sm font-medium">
              {t('paymentFailure.whatHappensNext')}
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• {t('paymentFailure.optionRenew')}</li>
              <li>• {t('paymentFailure.optionDowngrade')}</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button 
            onClick={onRenewSubscription}
            className="w-full"
            size="lg"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            {t('paymentFailure.renewButton')}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={onDowngradeToFree}
            className="w-full"
            size="lg"
          >
            <Users className="w-4 h-4 mr-2" />
            {t('paymentFailure.downgradeButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
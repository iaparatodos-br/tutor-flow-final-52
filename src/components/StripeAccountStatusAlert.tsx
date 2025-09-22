import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StripeConnectAccount {
  id: string;
  stripe_account_id: string;
  account_status: string;
  status_reason?: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  charges_disabled_reason?: string;
  payouts_disabled_reason?: string;
  restrictions: any;
}

interface StripeAccountStatusAlertProps {
  account: StripeConnectAccount;
  onRefresh?: () => void;
  onOpenStripe?: () => void;
  loading?: boolean;
}

export function StripeAccountStatusAlert({ 
  account, 
  onRefresh, 
  onOpenStripe,
  loading = false 
}: StripeAccountStatusAlertProps) {
  const { t } = useTranslation(['financial', 'common']);

  // Only show alert if there are restrictions or issues
  if (account.account_status === 'active' && account.charges_enabled && account.payouts_enabled) {
    return null;
  }

  const getAlertVariant = () => {
    if (account.account_status === 'restricted') return 'destructive';
    return 'default';
  };

  const getStatusMessage = () => {
    if (account.account_status === 'restricted') {
      return t('financial:stripe.account.restricted.description');
    }
    if (!account.charges_enabled) {
      return t('financial:stripe.account.charges_disabled.description');
    }
    if (!account.payouts_enabled) {
      return t('financial:stripe.account.payouts_disabled.description');
    }
    return t('financial:stripe.account.pending.description');
  };

  const getActionMessage = () => {
    if (account.charges_disabled_reason) {
      return account.charges_disabled_reason;
    }
    if (account.status_reason) {
      return account.status_reason;
    }
    return t('financial:stripe.account.action_required');
  };

  return (
    <Alert variant={getAlertVariant()} className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {account.account_status === 'restricted' 
          ? t('financial:stripe.account.restricted.title')
          : t('financial:stripe.account.attention_required')
        }
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="space-y-2">
          <p>{getStatusMessage()}</p>
          {getActionMessage() && (
            <p className="text-sm text-muted-foreground">
              <strong>{t('common:reason')}:</strong> {getActionMessage()}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            {onOpenStripe && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onOpenStripe}
                className="gap-2"
              >
                <ExternalLink className="h-3 w-3" />
                {t('financial:stripe.open_dashboard')}
              </Button>
            )}
            {onRefresh && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onRefresh}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                {t('common:refresh')}
              </Button>
            )}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
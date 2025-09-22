import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StripeAccountGuardProps {
  children: React.ReactNode;
  requireChargesEnabled?: boolean;
}

export function StripeAccountGuard({ 
  children, 
  requireChargesEnabled = false 
}: StripeAccountGuardProps) {
  const { profile } = useProfile();
  const { t } = useTranslation(['financial', 'common']);
  const [accountStatus, setAccountStatus] = useState<{
    restricted: boolean;
    chargesDisabled: boolean;
    reason?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      checkAccountStatus();
    }
  }, [profile?.id]);

  const checkAccountStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('stripe_connect_accounts')
        .select('account_status, charges_enabled, status_reason, charges_disabled_reason')
        .eq('teacher_id', profile.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking account status:', error);
        setAccountStatus(null);
      } else if (data) {
        setAccountStatus({
          restricted: data.account_status === 'restricted',
          chargesDisabled: !data.charges_enabled,
          reason: data.status_reason || data.charges_disabled_reason
        });
      } else {
        setAccountStatus(null);
      }
    } catch (error) {
      console.error('Error in checkAccountStatus:', error);
      setAccountStatus(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  // If account is restricted or charges are disabled and we require charges
  if (accountStatus && (accountStatus.restricted || (requireChargesEnabled && accountStatus.chargesDisabled))) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>
          {accountStatus.restricted 
            ? t('financial:stripe.account.restricted.title')
            : t('financial:stripe.account.charges_disabled.title')
          }
        </AlertTitle>
        <AlertDescription>
          <div className="space-y-2">
            <p>
              {accountStatus.restricted 
                ? t('financial:stripe.account.restricted.description')
                : t('financial:stripe.account.charges_disabled.description')
              }
            </p>
            {accountStatus.reason && (
              <p className="text-sm">
                <strong>{t('common:reason')}:</strong> {accountStatus.reason}
              </p>
            )}
            <p className="text-sm">
              {t('financial:stripe.account.function_disabled')}
            </p>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
}
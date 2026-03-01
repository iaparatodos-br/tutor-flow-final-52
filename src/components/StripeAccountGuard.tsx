import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StripeAccountGuardProps {
  children: React.ReactNode;
}

export function StripeAccountGuard({ 
  children
}: StripeAccountGuardProps) {
  const { profile } = useProfile();
  const { t } = useTranslation(['financial', 'common']);
  const [hasStripeAccount, setHasStripeAccount] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      checkAccountStatus();
    }
  }, [profile?.id]);

  const checkAccountStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('stripe_connect_id')
        .eq('user_id', profile.id);

      if (error) {
        console.error('Error checking business profile:', error);
        setHasStripeAccount(null);
      } else {
        const hasAccount = Array.isArray(data) && data.length > 0 && !!data[0].stripe_connect_id;
        setHasStripeAccount(hasAccount);
      }
    } catch (error) {
      console.error('Error in checkAccountStatus:', error);
      setHasStripeAccount(null);
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

  if (!hasStripeAccount) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>
          {t('financial:stripe.account.no_account.title', 'Conta Stripe não configurada')}
        </AlertTitle>
        <AlertDescription>
          <div className="space-y-2">
            <p>
              {t('financial:stripe.account.no_account.description', 'Você precisa configurar uma conta Stripe Connect antes de criar faturas. Acesse Painel de Negócios para configurar.')}
            </p>
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
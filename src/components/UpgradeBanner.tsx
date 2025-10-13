import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Crown, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from 'react-i18next';

export function UpgradeBanner() {
  const navigate = useNavigate();
  const { currentPlan } = useSubscription();
  const { t } = useTranslation('subscription');

  // Only show for free plan users
  if (!currentPlan || currentPlan.slug !== 'free') {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 mb-6">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <Crown className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-amber-800">
                {t('upgradeBanner.title')}
              </h3>
              <p className="text-sm text-amber-700">
                {t('upgradeBanner.description')}
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/planos')}
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            size="sm"
          >
            {t('upgradeBanner.button')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
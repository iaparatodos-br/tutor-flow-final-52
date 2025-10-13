import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Star, Zap, Users, FileText, DollarSign, HardDrive, X } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { PlanDowngradeWarningModal } from '@/components/PlanDowngradeWarningModal';
import { PlanChangeConfirmationModal } from '@/components/PlanChangeConfirmationModal';
import { useStudentCount } from '@/hooks/useStudentCount';
import { useTranslation } from 'react-i18next';

export default function Planos() {
  const { t } = useTranslation('plans');
  const { plans, currentPlan, createCheckoutSession, subscription } = useSubscription();
  const { studentCount } = useStudentCount();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [downgradeWarning, setDowngradeWarning] = useState<{
    open: boolean;
    targetPlan: any;
  }>({ open: false, targetPlan: null });
  const [planChangeConfirmation, setPlanChangeConfirmation] = useState<{
    open: boolean;
    targetPlan: any;
  }>({ open: false, targetPlan: null });
  const navigate = useNavigate();

  const handlePlanSelect = async (planSlug: string) => {
    if (planSlug === 'free') {
      toast({
        title: t('messages.freePlanTitle'),
        description: t('messages.freePlanDescription'),
      });
      return;
    }

    if (currentPlan?.slug === planSlug) {
      navigate('/subscription');
      return;
    }

    const targetPlan = plans.find(p => p.slug === planSlug);
    if (!targetPlan) return;

    // Check if user has an active subscription (plan change)
    const hasActiveSubscription = subscription && 
      subscription.status === 'active' && 
      currentPlan && 
      currentPlan.slug !== 'free';

    if (hasActiveSubscription) {
      // Show plan change confirmation modal
      setPlanChangeConfirmation({
        open: true,
        targetPlan
      });
      return;
    }

    // If no active subscription, proceed with normal checkout
    await proceedWithCheckout(planSlug);
  };

  const proceedWithCheckout = async (planSlug: string) => {
    setLoadingPlan(planSlug);
    try {
      const checkoutUrl = await createCheckoutSession(planSlug);
      window.open(checkoutUrl, '_blank');
    } catch (error) {
      console.error('Error creating checkout:', error);
      toast({
        title: t('messages.errorTitle'),
        description: t('messages.errorDescription'),
        variant: "destructive",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleDowngradeConfirm = async () => {
    if (downgradeWarning.targetPlan) {
      await proceedWithCheckout(downgradeWarning.targetPlan.slug);
    }
    setDowngradeWarning({ open: false, targetPlan: null });
  };

  const handleDowngradeCancel = () => {
    setDowngradeWarning({ open: false, targetPlan: null });
  };

  const handlePlanChangeConfirm = async () => {
    if (planChangeConfirmation.targetPlan) {
      await proceedWithCheckout(planChangeConfirmation.targetPlan.slug);
    }
    setPlanChangeConfirmation({ open: false, targetPlan: null });
  };

  const handlePlanChangeCancel = () => {
    setPlanChangeConfirmation({ open: false, targetPlan: null });
  };

  const getFeatureIcon = (feature: string) => {
    switch (feature) {
      case 'financial_module': return <DollarSign className="h-4 w-4" />;
      case 'group_classes': return <Users className="h-4 w-4" />;
      case 'expenses': return <FileText className="h-4 w-4" />;
      case 'storage_mb': return <HardDrive className="h-4 w-4" />;
      case 'material_sharing': return <FileText className="h-4 w-4" />;
      default: return <Check className="h-4 w-4" />;
    }
  };

  const formatStorage = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(0)} GB`;
    }
    return `${mb} MB`;
  };

  const getFeatureLabel = (key: string, value: any) => {
    switch (key) {
      case 'financial_module':
        return value ? t('features.financialModuleFull') : t('features.financialModuleBasic');
      case 'group_classes':
        return value ? t('features.groupClasses') : t('features.individualOnly');
      case 'expenses':
        return value ? t('features.expenses') : t('features.noExpenses');
      case 'storage_mb':
        return `${t('features.storage')}: ${formatStorage(value)}`;
      case 'material_sharing':
        return value ? t('features.materialSharing') : t('features.limitedMaterials');
      default:
        return key;
    }
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.filter(plan => plan.slug !== 'free').map((plan) => {
            const isCurrentPlan = currentPlan?.id === plan.id;
            const isPremium = plan.slug === 'premium';
            const isPopular = plan.slug === 'professional';

            return (
              <Card
                key={plan.id}
                className={`relative ${
                  isCurrentPlan 
                    ? 'border-primary ring-2 ring-primary/20' 
                    : isPremium 
                    ? 'border-gradient-to-r from-purple-500 to-pink-500' 
                    : ''
                }`}
              >
                {isPopular && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                    <Star className="h-3 w-3 mr-1" />
                    {t('badges.mostPopular')}
                  </Badge>
                )}
                
                {isPremium && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-pink-500">
                    <Zap className="h-3 w-3 mr-1" />
                    {t('badges.premium')}
                  </Badge>
                )}

                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="text-3xl font-bold">
                    {plan.price_cents > 0 ? (
                      <>
                        R$ {(plan.price_cents / 100).toFixed(2)}
                        <span className="text-sm font-normal text-muted-foreground">{t('pricing.perMonth')}</span>
                      </>
                    ) : (
                      t('pricing.free')
                    )}
                  </div>
                  <CardDescription>
                    {t('pricing.upTo')} {plan.student_limit} {t('pricing.students')}
                    {plan.slug !== 'free' && (
                      <span className="block text-xs mt-1">
                        {t('pricing.additionalStudent')}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {Object.entries(plan.features).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        {getFeatureIcon(key)}
                        <span className={value ? '' : 'text-muted-foreground'}>
                          {getFeatureLabel(key, value)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <Button
                    className="w-full"
                    variant={isCurrentPlan ? "outline" : "default"}
                    onClick={() => handlePlanSelect(plan.slug)}
                    disabled={loadingPlan === plan.slug}
                  >
                    {loadingPlan === plan.slug ? (
                      t('buttons.loading')
                    ) : isCurrentPlan ? (
                      t('buttons.currentPlan')
                    ) : plan.price_cents === 0 ? (
                      t('buttons.free')
                    ) : (
                      t('buttons.subscribe')
                    )}
                  </Button>

                  {isCurrentPlan && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => navigate('/subscription')}
                    >
                      {t('buttons.manageSubscription')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="bg-muted/50 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{t('comparison.title')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">{t('comparison.table.feature')}</th>
                  {plans.filter(plan => plan.slug !== 'free').map((plan) => (
                    <th key={plan.id} className="text-center py-2 px-4">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2">{t('comparison.table.studentLimit')}</td>
                  {plans.filter(plan => plan.slug !== 'free').map((plan) => (
                    <td key={plan.id} className="text-center py-2 px-4">
                      {plan.student_limit}
                      {plan.slug !== 'free' && (
                        <div className="text-xs text-muted-foreground">
                          {t('pricing.unlimited')}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-2">{t('comparison.table.financialModule')}</td>
                  {plans.filter(plan => plan.slug !== 'free').map((plan) => (
                    <td key={plan.id} className="text-center py-2 px-4">
                      {plan.features.financial_module ? (
                        <Check className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-4 w-4 text-red-500 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-2">{t('comparison.table.groupClasses')}</td>
                  {plans.filter(plan => plan.slug !== 'free').map((plan) => (
                    <td key={plan.id} className="text-center py-2 px-4">
                      {plan.features.group_classes ? (
                        <Check className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-red-500">✗</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-2">{t('comparison.table.expenses')}</td>
                  {plans.filter(plan => plan.slug !== 'free').map((plan) => (
                    <td key={plan.id} className="text-center py-2 px-4">
                      {plan.features.expenses ? (
                        <Check className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-red-500">✗</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                   <td className="py-2">{t('comparison.table.materialSharing')}</td>
                   {plans.filter(plan => plan.slug !== 'free').map((plan) => (
                     <td key={plan.id} className="text-center py-2 px-4">
                       <Check className="h-4 w-4 text-green-500 mx-auto" />
                     </td>
                   ))}
                 </tr>
                 <tr>
                   <td className="py-2">{t('comparison.table.storage')}</td>
                   {plans.filter(plan => plan.slug !== 'free').map((plan) => (
                     <td key={plan.id} className="text-center py-2 px-4">
                       <div className="font-medium">{formatStorage(plan.features.storage_mb)}</div>
                     </td>
                   ))}
                 </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PlanDowngradeWarningModal
        open={downgradeWarning.open}
        onClose={handleDowngradeCancel}
        onConfirm={handleDowngradeConfirm}
        currentPlan={currentPlan}
        targetPlan={downgradeWarning.targetPlan}
        currentStudentCount={studentCount}
        subscriptionEndDate={subscription?.current_period_end}
      />

      <PlanChangeConfirmationModal
        open={planChangeConfirmation.open}
        onClose={handlePlanChangeCancel}
        onConfirm={handlePlanChangeConfirm}
        currentPlan={currentPlan}
        newPlan={planChangeConfirmation.targetPlan}
        currentStudentCount={studentCount}
        isLoading={loadingPlan !== null}
      />
    </Layout>
  );
}
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

export default function Planos() {
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
        title: "Plano Gratuito",
        description: "Você já tem acesso ao plano gratuito!",
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
        title: "Erro",
        description: "Não foi possível iniciar o processo de assinatura. Tente novamente.",
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
        return value ? 'Módulo Financeiro Completo' : 'Módulo Financeiro Básico';
      case 'group_classes':
        return value ? 'Aulas em Grupo' : 'Apenas Aulas Individuais';
      case 'expenses':
        return value ? 'Cadastro de Despesas' : 'Sem Cadastro de Despesas';
      case 'storage_mb':
        return `Armazenamento de Materiais: ${formatStorage(value)}`;
      case 'material_sharing':
        return value ? 'Upload e Compartilhamento de Materiais' : 'Materiais Limitados';
      default:
        return key;
    }
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Planos TutorFlow</h1>
          <p className="text-muted-foreground mt-2">
            Escolha o plano ideal para sua atividade de ensino. Todos os planos incluem upload e compartilhamento de materiais.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
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
                    Mais Popular
                  </Badge>
                )}
                
                {isPremium && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-pink-500">
                    <Zap className="h-3 w-3 mr-1" />
                    Premium
                  </Badge>
                )}

                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="text-3xl font-bold">
                    {plan.price_cents > 0 ? (
                      <>
                        R$ {(plan.price_cents / 100).toFixed(2)}
                        <span className="text-sm font-normal text-muted-foreground">/mês</span>
                      </>
                    ) : (
                      'Grátis'
                    )}
                  </div>
                  <CardDescription>
                    Até {plan.student_limit} alunos
                    {plan.slug !== 'free' && (
                      <span className="block text-xs mt-1">
                        + R$ 5,00 por aluno adicional
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
                      "Carregando..."
                    ) : isCurrentPlan ? (
                      "Plano Atual"
                    ) : plan.price_cents === 0 ? (
                      "Gratuito"
                    ) : (
                      "Assinar"
                    )}
                  </Button>

                  {isCurrentPlan && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => navigate('/subscription')}
                    >
                      Gerenciar Assinatura
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="bg-muted/50 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Compare os Planos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Funcionalidade</th>
                  {plans.map((plan) => (
                    <th key={plan.id} className="text-center py-2 px-4">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2">Limite de Alunos</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="text-center py-2 px-4">
                      {plan.student_limit}
                      {plan.slug !== 'free' && (
                        <div className="text-xs text-muted-foreground">
                          +ilimitados
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-2">Módulo Financeiro</td>
                  {plans.map((plan) => (
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
                  <td className="py-2">Aulas em Grupo</td>
                  {plans.map((plan) => (
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
                  <td className="py-2">Cadastro de Despesas</td>
                  {plans.map((plan) => (
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
                   <td className="py-2">Upload e Compartilhamento de Materiais</td>
                   {plans.map((plan) => (
                     <td key={plan.id} className="text-center py-2 px-4">
                       <Check className="h-4 w-4 text-green-500 mx-auto" />
                     </td>
                   ))}
                 </tr>
                 <tr>
                   <td className="py-2">Armazenamento de Materiais</td>
                   {plans.map((plan) => (
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
import { ReactNode } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FeatureGateProps {
  feature?: keyof typeof defaultFeatures;
  requiredPlan?: string;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgrade?: boolean;
}

const defaultFeatures = {
  financial_module: 'Módulo Financeiro',
  group_classes: 'Aulas em Grupo',
  expenses: 'Cadastro de Despesas',
  storage_mb: 'Armazenamento'
};

export function FeatureGate({ 
  feature, 
  requiredPlan, 
  children, 
  fallback, 
  showUpgrade = true 
}: FeatureGateProps) {
  const { hasFeature, currentPlan } = useSubscription();
  const navigate = useNavigate();

  // If no feature specified, always show content
  if (!feature && !requiredPlan) {
    return <>{children}</>;
  }

  // Check feature access
  const hasAccess = feature ? hasFeature(feature) : true;
  
  // Check plan access
  const planAccess = requiredPlan ? currentPlan?.slug !== 'free' : true;

  if (hasAccess && planAccess) {
    return <>{children}</>;
  }

  // Show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show upgrade prompt if enabled
  if (showUpgrade) {
    const featureName = feature ? defaultFeatures[feature] : 'Esta funcionalidade';
    
    return (
      <Card className="border-dashed border-2 border-muted-foreground/25">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg">
            {featureName} - Funcionalidade Premium
          </CardTitle>
          <CardDescription>
            {feature === 'financial_module' && 
              'Controle completo das suas finanças com relatórios detalhados, faturas automáticas e acompanhamento de pagamentos.'
            }
            {feature === 'group_classes' && 
              'Organize aulas em grupo, gerencie múltiplos alunos simultaneamente e otimize sua agenda.'
            }
            {feature === 'expenses' && 
              'Cadastre e organize suas despesas por categoria, anexe comprovantes e tenha controle total dos seus gastos.'
            }
            {!feature && 
              'Esta funcionalidade está disponível apenas nos planos pagos.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button 
            onClick={() => navigate('/planos')}
            className="w-full"
          >
            Ver Planos
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Return nothing if no upgrade prompt
  return null;
}
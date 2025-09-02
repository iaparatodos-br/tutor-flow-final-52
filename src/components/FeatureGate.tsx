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
  studentCount?: number; // For student limit checks
}

const defaultFeatures = {
  financial_module: 'Módulo Financeiro',
  group_classes: 'Aulas em Grupo', 
  expenses: 'Cadastro de Despesas',
  storage_mb: 'Armazenamento',
  payment_accounts: 'Contas de Recebimento',
  class_reports: 'Relatórios de Aula',
  material_sharing: 'Compartilhamento de Materiais'
};

export function FeatureGate({ 
  feature, 
  requiredPlan, 
  children, 
  fallback, 
  showUpgrade = true,
  studentCount 
}: FeatureGateProps) {
  const { hasFeature, currentPlan, getStudentOverageInfo } = useSubscription();
  const navigate = useNavigate();

  // If no feature specified, always show content
  if (!feature && !requiredPlan && !studentCount) {
    return <>{children}</>;
  }

  // Check student limit if provided
  if (studentCount !== undefined && currentPlan) {
    const overageInfo = getStudentOverageInfo(studentCount);
    if (overageInfo.isOverLimit && currentPlan.slug === 'free') {
      // Block free users at limit
      if (showUpgrade) {
        return (
          <Card className="border-dashed border-2 border-amber-200 bg-amber-50">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <Lock className="h-6 w-6 text-amber-600" />
              </div>
              <CardTitle className="text-lg text-amber-800">
                Limite de Alunos Atingido
              </CardTitle>
              <CardDescription className="text-amber-700">
                Você atingiu o limite de {currentPlan.student_limit} alunos do plano gratuito. 
                Faça upgrade para adicionar mais alunos.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                onClick={() => navigate('/planos')}
                className="w-full"
              >
                Ver Planos Pagos
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        );
      }
      return fallback || null;
    }
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
            {feature === 'payment_accounts' && 
              'Configure múltiplas contas bancárias para recebimento, incluindo PIX e integração com Stripe.'
            }
            {feature === 'class_reports' && 
              'Crie relatórios detalhados das aulas, acompanhe o progresso dos alunos e compartilhe feedback.'
            }
            {feature === 'material_sharing' && 
              'Compartilhe materiais didáticos com seus alunos de forma organizada e controlada.'
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
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';

interface FinancialRouteGuardProps {
  children: React.ReactNode;
}

export function FinancialRouteGuard({ children }: FinancialRouteGuardProps) {
  const { hasFeature, loading } = useSubscription();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !hasFeature('financial_module')) {
      toast.error('Acesso negado. Faça upgrade do seu plano para acessar o módulo financeiro.');
      navigate('/dashboard');
    }
  }, [hasFeature, loading, navigate]);

  // Show loading while checking permissions
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  // Don't render children if user doesn't have access
  if (!hasFeature('financial_module')) {
    return null;
  }

  return <>{children}</>;
}
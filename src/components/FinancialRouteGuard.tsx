import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useProfile } from '@/contexts/ProfileContext';
import { toast } from 'sonner';

interface FinancialRouteGuardProps {
  children: React.ReactNode;
}

export function FinancialRouteGuard({ children }: FinancialRouteGuardProps) {
  const { hasFeature, hasTeacherFeature, loading } = useSubscription();
  const { profile, isProfessor } = useProfile();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && profile) {
      // Check if user has access to financial module
      const hasAccess = isProfessor ? 
        hasFeature('financial_module') : 
        hasTeacherFeature('financial_module');
      
      if (!hasAccess) {
        toast.error('Acesso negado. Faça upgrade do seu plano para acessar o módulo financeiro.');
        navigate('/dashboard');
      }
    }
  }, [hasFeature, hasTeacherFeature, loading, navigate, profile, isProfessor]);

  // Show loading while checking permissions
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  // Don't render children if user doesn't have access
  if (!profile) return null;
  
  const hasAccess = isProfessor ? 
    hasFeature('financial_module') : 
    hasTeacherFeature('financial_module');
    
  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
}
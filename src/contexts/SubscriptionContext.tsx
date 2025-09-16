import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  billing_interval: string;
  student_limit: number;
  features: {
    financial_module: boolean;
    group_classes: boolean;
    expenses: boolean;
    storage_mb: number;
    payment_accounts?: boolean;
    class_reports?: boolean;
    material_sharing?: boolean;
  };
}

interface UserSubscription {
  id: string;
  plan_id: string;
  status: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
  extra_students: number;
  extra_cost_cents: number;
}

interface SubscriptionContextType {
  currentPlan: SubscriptionPlan | null;
  subscription: UserSubscription | null;
  plans: SubscriptionPlan[];
  loading: boolean;
  hasFeature: (feature: keyof SubscriptionPlan['features']) => boolean;
  hasTeacherFeature: (feature: keyof SubscriptionPlan['features']) => boolean;
  canAddStudent: () => boolean;
  getStudentOverageInfo: (currentStudentCount: number) => {
    isOverLimit: boolean;
    additionalCost: number;
    message: string;
  };
  refreshSubscription: () => Promise<void>;
  createCheckoutSession: (planSlug: string) => Promise<string>;
  cancelSubscription: (action: 'cancel' | 'reactivate') => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [teacherPlan, setTeacherPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_cents');
      
      if (error) throw error;
      setPlans((data || []) as unknown as SubscriptionPlan[]);
    } catch (error) {
      console.error('Error loading plans:', error);
    }
  };

  const loadSubscription = async () => {
    if (!user) return;

    try {
      // Timeout para evitar travamento na inicialização
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout no carregamento inicial')), 5000)
      );

      const invokePromise = supabase.functions.invoke('check-subscription-status', {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as any;
      
      if (error) {
        console.warn('Erro ao carregar subscription inicial:', error);
        // Usar plano gratuito como fallback
        const freePlan = plans.find(p => p.slug === 'free');
        setCurrentPlan(freePlan || null);
        setSubscription(null);
        return;
      }

      if (data?.subscription) {
        setSubscription(data.subscription);
        
        // Use plan directly from check-subscription-status response if available
        if (data.plan) {
          setCurrentPlan(data.plan as unknown as SubscriptionPlan);
        } else {
          // Fallback to loading plan separately
          const { data: planData, error: planError } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', data.subscription.plan_id)
            .single();
          
          if (!planError && planData) {
            setCurrentPlan(planData as unknown as SubscriptionPlan);
          }
        }
      } else {
        // Use plan from response (should be free plan) or find free plan
        if (data?.plan) {
          setCurrentPlan(data.plan as unknown as SubscriptionPlan);
        } else {
          const freePlan = plans.find(p => p.slug === 'free');
          setCurrentPlan(freePlan || null);
        }
        setSubscription(null);
      }

      // Load teacher's plan if user is a student
      if (profile?.role === 'aluno') {
        await loadTeacherSubscriptions();
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
      // Fallback to free plan
      const freePlan = plans.find(p => p.slug === 'free');
      setCurrentPlan(freePlan || null);
      setSubscription(null);
    }
  };

  const loadTeacherSubscriptions = async () => {
    if (!user) return;
    
    try {
      // Get teachers for this student
      const { data: relationships, error: relationshipError } = await supabase
        .from('teacher_student_relationships')
        .select('teacher_id')
        .eq('student_id', user.id);
      
      if (relationshipError) {
        console.error('Error loading teacher relationships:', relationshipError);
        return;
      }
      
      if (!relationships || relationships.length === 0) {
        console.log('No teachers found for student');
        return;
      }
      
      // Get the first teacher's subscription (for now, we'll use the first teacher)
      const teacherId = relationships[0].teacher_id;
      
      // Check if teacher has an active subscription
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_plans(*)
        `)
        .eq('user_id', teacherId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (subscriptionError && subscriptionError.code !== 'PGRST116') {
        console.error('Error loading teacher subscription:', subscriptionError);
        return;
      }

      if (subscriptionData && subscriptionData.subscription_plans) {
        setTeacherPlan(subscriptionData.subscription_plans as unknown as SubscriptionPlan);
      } else {
        // Teacher has no active subscription, use free plan
        const freePlan = plans.find(p => p.slug === 'free');
        setTeacherPlan(freePlan || null);
      }
    } catch (error) {
      console.error('Error loading teacher subscription:', error);
      const freePlan = plans.find(p => p.slug === 'free');
      setTeacherPlan(freePlan || null);
    }
  };

  const refreshSubscription = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Usar timeout para evitar problemas de conectividade
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout na verificação da subscription')), 8000)
      );

      const invokePromise = supabase.functions.invoke('check-subscription-status', {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as any;
      
      if (error) {
        console.error('Error checking subscription:', error);
        
        // Se não conseguiu acessar a função, usar plano gratuito
        const freePlan = plans.find(p => p.slug === 'free');
        setCurrentPlan(freePlan || null);
        setSubscription(null);
        console.log('Erro na verificação - usando plano gratuito como fallback');
        return;
      }
      
      if (data?.subscription) {
        setSubscription(data.subscription);
        setCurrentPlan(data.plan);
      } else {
        // No active subscription - user is on free plan
        setSubscription(null);
        const freePlan = plans.find(p => p.slug === 'free');
        setCurrentPlan(freePlan || null);
      }
    } catch (error) {
      console.error('Error refreshing subscription:', error);
      
      // Em caso de erro, usar plano gratuito como fallback
      const freePlan = plans.find(p => p.slug === 'free');
      setCurrentPlan(freePlan || null);
      setSubscription(null);
      console.log('Fallback: usando plano gratuito após erro de conectividade');
    } finally {
      setLoading(false);
    }
  };

  const hasFeature = (feature: keyof SubscriptionPlan['features']): boolean => {
    if (!currentPlan) return false;
    const featureValue = currentPlan.features[feature];
    return typeof featureValue === 'boolean' ? featureValue : Boolean(featureValue);
  };

  const hasTeacherFeature = (feature: keyof SubscriptionPlan['features']): boolean => {
    // For professors, use their own plan
    if (profile?.role === 'professor') {
      return hasFeature(feature);
    }
    
    // For students, check teacher's plan
    if (profile?.role === 'aluno' && teacherPlan) {
      const featureValue = teacherPlan.features[feature];
      return typeof featureValue === 'boolean' ? featureValue : Boolean(featureValue);
    }
    
    return false;
  };

  const canAddStudent = (): boolean => {
    // Free plan blocks after limit, paid plans allow with additional cost
    if (!currentPlan) return false;
    if (currentPlan.slug === 'free') {
      // Will be checked against actual student count in component
      return true; // Let component handle the blocking logic
    }
    return true; // Paid plans always allow (with additional cost)
  };

  const getStudentOverageInfo = (currentStudentCount: number) => {
    if (!currentPlan) {
      return {
        isOverLimit: false,
        additionalCost: 0,
        message: ''
      };
    }

    const isOverLimit = currentStudentCount >= currentPlan.student_limit;
    
    if (currentPlan.slug === 'free') {
      return {
        isOverLimit,
        additionalCost: 0,
        message: isOverLimit 
          ? `Limite de ${currentPlan.student_limit} alunos atingido. Faça upgrade do seu plano para adicionar mais alunos.`
          : ''
      };
    }

    // Paid plans
    if (isOverLimit) {
      const extraStudents = currentStudentCount - currentPlan.student_limit + 1;
      const additionalCost = extraStudents * 5; // R$ 5 per extra student
      
      return {
        isOverLimit: true,
        additionalCost,
        message: `Este aluno gerará um custo adicional de R$ ${additionalCost.toFixed(2)} na sua fatura mensal.`
      };
    }

    return {
      isOverLimit: false,
      additionalCost: 0,
      message: ''
    };
  };

  const createCheckoutSession = async (planSlug: string): Promise<string> => {
    // Implementar retry com backoff exponencial
    let retries = 0;
    const maxRetries = 3;
    
    console.log(`SubscriptionContext: Iniciando checkout para plano ${planSlug}`);
    
    while (retries < maxRetries) {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout na criação do checkout')), 15000)
        );

        // Prepare the request body explicitly
        const requestBody = { planSlug };
        console.log(`SubscriptionContext: Tentativa ${retries + 1}, enviando body:`, requestBody);

        const invokePromise = supabase.functions.invoke('create-subscription-checkout', {
          body: requestBody
        });

        const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as any;
        console.log(`SubscriptionContext: Resposta recebida:`, { data, error });
        
        if (error) {
          if (retries < maxRetries - 1) {
            retries++;
            console.log(`Retry ${retries}/${maxRetries} para checkout`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retries)); // backoff exponencial
            continue;
          }
          throw error;
        }

        if (data?.url) {
          return data.url;
        } else {
          throw new Error('URL de checkout não recebida');
        }
      } catch (error) {
        if (retries >= maxRetries - 1) {
          console.error('Error creating checkout session após todos os retries:', error);
          toast.error('Erro ao criar sessão de pagamento. Verifique sua conexão e tente novamente.');
          throw error;
        }
        retries++;
        console.log(`Retry ${retries}/${maxRetries} após erro:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
    
    throw new Error('Falha após todas as tentativas');
  };

  const cancelSubscription = async (action: 'cancel' | 'reactivate'): Promise<void> => {
    try {
      const { error } = await supabase.functions.invoke('cancel-subscription', {
        body: { action },
      });

      if (error) throw error;

      // Force refresh subscription state to reflect the change
      await refreshSubscription();
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw error;
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    if (plans.length > 0) {
      loadSubscription().finally(() => setLoading(false));
    }
  }, [user, plans, profile]);

  // Verificação por parâmetros de URL (retorno do Stripe)
  useEffect(() => {
    if (!user) return;

    const urlParams = new URLSearchParams(window.location.search);
    const stripeParams = [
      'success',
      'payment_intent',
      'payment_intent_client_secret',
      'setup_intent',
      'setup_intent_client_secret',
      'subscription_id',
      'session_id'
    ];

    // Verifica se há parâmetros do Stripe na URL
    const hasStripeParams = stripeParams.some(param => urlParams.has(param));

    if (hasStripeParams) {
      console.log('Stripe return detected, refreshing subscription status...');
      
      const verifyAndCleanUrl = async () => {
        try {
          await refreshSubscription();
          
          // Limpa os parâmetros da URL após a verificação
          const newUrl = new URL(window.location.href);
          stripeParams.forEach(param => newUrl.searchParams.delete(param));
          
          // Atualiza a URL sem recarregar a página
          window.history.replaceState({}, '', newUrl.toString());
        } catch (error) {
          console.error('Error verifying subscription after Stripe return:', error);
        }
      };

      verifyAndCleanUrl();
    }
  }, [user, refreshSubscription]);

  // Verificação diária do status da subscription à meia-noite
  useEffect(() => {
    if (!user) return;

    const scheduleNextMidnightCheck = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0); // Meia-noite
      
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      
      return setTimeout(async () => {
        try {
          await refreshSubscription();
        } catch (error) {
          console.error('Error during midnight subscription check:', error);
        }
        
        // Agendar próxima verificação em 24 horas
        const interval = setInterval(async () => {
          try {
            await refreshSubscription();
          } catch (error) {
            console.error('Error during daily subscription check:', error);
          }
        }, 24 * 60 * 60 * 1000); // 24 horas
        
        return interval;
      }, msUntilMidnight);
    };

    const initialTimeout = scheduleNextMidnightCheck();
    
    return () => {
      clearTimeout(initialTimeout);
    };
  }, [user]);

  return (
    <SubscriptionContext.Provider
      value={{
        currentPlan,
        subscription,
        plans,
        loading,
        hasFeature,
        hasTeacherFeature,
        canAddStudent,
        getStudentOverageInfo,
        refreshSubscription,
        createCheckoutSession,
        cancelSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
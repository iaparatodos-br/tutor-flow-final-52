import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useTeacherContext } from './TeacherContext';
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

interface PendingBoletoData {
  detected: boolean;
  boletoUrl?: string;
  dueDate?: string;
  barcode?: string;
  amount?: number;
}

interface SubscriptionContextType {
  currentPlan: SubscriptionPlan | null;
  subscription: UserSubscription | null;
  plans: SubscriptionPlan[];
  loading: boolean;
  needsStudentSelection: boolean;
  studentSelectionData: any;
  pendingBoletoDetected: boolean;
  pendingBoletoData: PendingBoletoData | null;
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
  completeStudentSelection: () => Promise<void>;
  dismissPendingBoleto: () => void;
  teacherPlanLoading: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [teacherPlan, setTeacherPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsStudentSelection, setNeedsStudentSelection] = useState(false);
  const [studentSelectionData, setStudentSelectionData] = useState<any>(null);
  const [pendingBoletoDetected, setPendingBoletoDetected] = useState(false);
  const [pendingBoletoData, setPendingBoletoData] = useState<PendingBoletoData | null>(null);
  const [teacherPlanLoading, setTeacherPlanLoading] = useState(false);
  const subscriptionLoadingRef = useRef(false);

  const teacherContext = useTeacherContext();

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

  /**
   * Helper: when payment failure is detected, build studentSelectionData
   * with isPaymentFailure=true so the unified modal handles everything.
   */
  const activatePaymentFailureFlow = async (failurePlan: any) => {
    try {
      const { data: students } = await supabase
        .rpc('get_teacher_students', { teacher_user_id: user?.id });
      
      const freePlan = plans.find(p => p.slug === 'free');
      if (!freePlan) return;
      
      const currentStudentCount = students?.length || 0;
      const studentData = (students || []).map((s: any) => ({
        id: s.student_id,
        relationship_id: s.relationship_id,
        name: s.student_name,
        email: s.student_email,
        created_at: s.created_at
      }));

      setStudentSelectionData({
        students: studentData,
        currentPlan: failurePlan,
        newPlan: freePlan,
        currentCount: currentStudentCount,
        targetLimit: freePlan.student_limit,
        needToRemove: currentStudentCount - freePlan.student_limit,
        isPaymentFailure: true
      });
      setNeedsStudentSelection(true);
      setCurrentPlan(freePlan);
      setSubscription(null);
    } catch (error) {
      console.error('Error activating payment failure flow:', error);
    }
  };

  const loadSubscription = async () => {
    if (!user) return;

    // Prevent concurrent in-flight calls (race condition guard)
    if (subscriptionLoadingRef.current) return;
    subscriptionLoadingRef.current = true;

    if (profile?.role === 'aluno') {
      const freePlan = plans.find(p => p.slug === 'free');
      setCurrentPlan(freePlan || null);
      setSubscription(null);
      subscriptionLoadingRef.current = false;
      return;
    }

    let retries = 0;
    const maxRetries = 2;

    const attemptLoad = async (): Promise<any> => {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout no carregamento inicial')), 12000)
      );

      const invokePromise = supabase.functions.invoke('check-subscription-status', {
        headers: { 'Content-Type': 'application/json' }
      });

      return Promise.race([invokePromise, timeoutPromise]);
    };

    try {
      let data: any;
      let lastError: any;

      while (retries <= maxRetries) {
        try {
          const result = await attemptLoad() as any;
          if (result.error) throw result.error;
          data = result.data;
          break;
        } catch (err) {
          lastError = err;
          if (retries < maxRetries) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          } else {
            throw lastError;
          }
        }
      }

      if (!data) {
        console.warn('Erro ao carregar subscription inicial após retentativas:', lastError);
        // Preserve prior state on transient error — only set free plan on first load
        if (!currentPlan) {
          const freePlan = plans.find(p => p.slug === 'free');
          setCurrentPlan(freePlan || null);
        }
        setSubscription(null);
        return;
      }

      // PRIORITY 1: Pending boleto
      if (data?.pendingBoleto?.detected) {
        console.log('Pending boleto detected - showing boleto modal');
        setPendingBoletoDetected(true);
        setPendingBoletoData(data.pendingBoleto);
        setSubscription(data.subscription);
        if (data.plan) setCurrentPlan(data.plan as unknown as SubscriptionPlan);
        return;
      }

      // PRIORITY 2: Active subscription
      if (data?.subscription && data.subscription.status === 'active') {
        setSubscription(data.subscription);
        if (data.plan) {
          setCurrentPlan(data.plan as unknown as SubscriptionPlan);
        } else {
          const { data: planData, error: planError } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', data.subscription.plan_id)
            .single();
          if (!planError && planData) setCurrentPlan(planData as unknown as SubscriptionPlan);
        }
        
        // Active subscription with payment failure (past_due in Stripe)
        if (data.paymentFailure?.detected) {
          console.log('Payment failure detected for active subscription:', data.paymentFailure);
          await activatePaymentFailureFlow(data.plan || currentPlan);
        } else {
          setPendingBoletoDetected(false);
          setPendingBoletoData(null);
          setNeedsStudentSelection(false);
          setStudentSelectionData(null);
        }
      } else if (data?.paymentFailure?.detected || data?.payment_failed) {
        // Payment failure without active subscription
        console.log('Payment failure detected (no active subscription)');
        const failurePlan = data.plan || currentPlan;
        if (data.plan) setCurrentPlan(data.plan as unknown as SubscriptionPlan);
        setSubscription(null);
        await activatePaymentFailureFlow(failurePlan);
      } else if (data?.needs_student_selection) {
        setNeedsStudentSelection(true);
        setStudentSelectionData({
          students: data.current_students,
          currentPlan: data.previous_plan,
          newPlan: data.plan,
          currentCount: data.current_students?.length || 0,
          targetLimit: data.plan?.student_limit || 0,
          needToRemove: (data.current_students?.length || 0) - (data.plan?.student_limit || 0),
          isPaymentFailure: false
        });
        setCurrentPlan(data.plan as unknown as SubscriptionPlan);
        setSubscription(null);
      } else {
        if (data?.plan) {
          setCurrentPlan(data.plan as unknown as SubscriptionPlan);
        } else {
          const freePlan = plans.find(p => p.slug === 'free');
          setCurrentPlan(freePlan || null);
        }
        setSubscription(null);
        setNeedsStudentSelection(false);
        setStudentSelectionData(null);
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
      // Preserve prior state on transient error — only set free plan on first load
      if (!currentPlan) {
        const freePlan = plans.find(p => p.slug === 'free');
        setCurrentPlan(freePlan || null);
      }
      setSubscription(null);
    } finally {
      subscriptionLoadingRef.current = false;
    }
  };

  const loadTeacherSubscriptions = async () => {
    if (!user || profile?.role !== 'aluno') return;
    setTeacherPlanLoading(true);
    
    const selectedTeacherId = teacherContext?.selectedTeacherId;
    
    if (!selectedTeacherId) {
      const freePlan = plans.find(p => p.slug === 'free');
      setTeacherPlan(freePlan || null);
      setTeacherPlanLoading(false);
      return;
    }
    
    try {
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('user_subscriptions')
        .select(`*, subscription_plans(*)`)
        .eq('user_id', selectedTeacherId)
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
        const freePlan = plans.find(p => p.slug === 'free');
        setTeacherPlan(freePlan || null);
      }
    } catch (error) {
      console.error('Error loading teacher subscription:', error);
      const freePlan = plans.find(p => p.slug === 'free');
      setTeacherPlan(freePlan || null);
    } finally {
      setTeacherPlanLoading(false);
    }
  };

  const refreshSubscription = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout na verificação da subscription')), 12000)
      );

      const invokePromise = supabase.functions.invoke('check-subscription-status', {
        headers: { 'Content-Type': 'application/json' }
      });

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as any;

      if (error) {
        console.error('Error checking subscription:', error);
        // Preserve prior state on transient error — only set free plan if no plan was loaded
        if (!currentPlan) {
          const freePlan = plans.find(p => p.slug === 'free');
          setCurrentPlan(freePlan || null);
        }
        setSubscription(null);
        return;
      }
      
      // PRIORITY 1: Pending boleto
      if (data?.pendingBoleto?.detected) {
        console.log('Pending boleto detected on refresh');
        setPendingBoletoDetected(true);
        setPendingBoletoData(data.pendingBoleto);
        setSubscription(data.subscription);
        setCurrentPlan(data.plan as unknown as SubscriptionPlan);
        setNeedsStudentSelection(false);
        setStudentSelectionData(null);
        return;
      }
      
      // PRIORITY 2: Active subscription
      if (data?.subscription && data.subscription.status === 'active') {
        console.log('Active subscription found on refresh');
        setSubscription(data.subscription);
        setCurrentPlan(data.plan);
        
        if (data.paymentFailure?.detected) {
          console.log('Payment failure detected for active subscription on refresh');
          await activatePaymentFailureFlow(data.plan);
        } else {
          setNeedsStudentSelection(false);
          setStudentSelectionData(null);
        }
        setPendingBoletoDetected(false);
        setPendingBoletoData(null);
      } else if (data?.paymentFailure?.detected || data?.payment_failed) {
        console.log('Payment failure detected on refresh (no active subscription)');
        if (data.plan) setCurrentPlan(data.plan);
        setSubscription(null);
        await activatePaymentFailureFlow(data.plan || currentPlan);
      } else if (data?.needs_student_selection) {
        setNeedsStudentSelection(true);
        setStudentSelectionData({
          students: data.current_students,
          currentPlan: data.previous_plan,
          newPlan: data.plan,
          currentCount: data.current_students?.length || 0,
          targetLimit: data.plan?.student_limit || 0,
          needToRemove: (data.current_students?.length || 0) - (data.plan?.student_limit || 0),
          isPaymentFailure: false
        });
        setCurrentPlan(data.plan);
        setSubscription(null);
      } else {
        setSubscription(null);
        const freePlan = plans.find(p => p.slug === 'free');
        setCurrentPlan(freePlan || null);
        setNeedsStudentSelection(false);
        setStudentSelectionData(null);
      }
    } catch (error) {
      console.error('Error refreshing subscription:', error);
      // Preserve prior state on transient error — only set free plan if no plan was loaded
      if (!currentPlan) {
        const freePlan = plans.find(p => p.slug === 'free');
        setCurrentPlan(freePlan || null);
      }
      setSubscription(null);
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
    if (profile?.role === 'professor') return hasFeature(feature);
    if (profile?.role === 'aluno' && teacherPlan) {
      const featureValue = teacherPlan.features[feature];
      return typeof featureValue === 'boolean' ? featureValue : Boolean(featureValue);
    }
    return false;
  };

  const canAddStudent = (): boolean => {
    if (!currentPlan) return false;
    if (currentPlan.slug === 'free') return true;
    return true;
  };

  const getStudentOverageInfo = (currentStudentCount: number) => {
    if (!currentPlan) {
      return { isOverLimit: false, additionalCost: 0, message: '' };
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

    if (isOverLimit) {
      const extraStudents = currentStudentCount - currentPlan.student_limit + 1;
      const additionalCost = extraStudents * 5;
      return {
        isOverLimit: true,
        additionalCost,
        message: `Este aluno gerará um custo adicional de R$ ${additionalCost.toFixed(2)} na sua fatura mensal.`
      };
    }

    return { isOverLimit: false, additionalCost: 0, message: '' };
  };

  const createCheckoutSession = async (planSlug: string): Promise<string> => {
    if (!user) throw new Error('Usuário não autenticado');

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error('Sessão inválida');
      if (!session) {
        await supabase.auth.signOut();
        window.location.href = '/auth';
        throw new Error('Sessão expirada');
      }

      const expiresAt = session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      if (expiresAt - now < 300) {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          await supabase.auth.signOut();
          window.location.href = '/auth';
          throw new Error('Não foi possível renovar a sessão');
        }
      }
    } catch (error) {
      throw error;
    }

    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout na criação do checkout')), 15000)
        );

        const invokePromise = supabase.functions.invoke('create-subscription-checkout', {
          body: { planSlug }
        });

        const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as any;
        
        if (error) {
          if (error.message?.includes('401')) {
            await supabase.auth.signOut();
            window.location.href = '/auth';
            throw new Error('Sessão expirada. Por favor, faça login novamente.');
          }
          if (retries < maxRetries - 1) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            continue;
          }
          throw error;
        }

        if (data?.url) return data.url;
        throw new Error('URL de checkout não recebida');
      } catch (error) {
        if (retries >= maxRetries - 1) {
          if (error instanceof Error && error.message.includes('Sessão expirada')) {
            toast.error('Sua sessão expirou. Por favor, faça login novamente.');
          } else {
            toast.error('Erro ao criar sessão de pagamento. Verifique sua conexão e tente novamente.');
          }
          throw error;
        }
        retries++;
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
    
    throw new Error('Falha após todas as tentativas');
  };

  const completeStudentSelection = async () => {
    setNeedsStudentSelection(false);
    setStudentSelectionData(null);
    await refreshSubscription();
  };

  const cancelSubscription = async (action: 'cancel' | 'reactivate'): Promise<void> => {
    try {
      const { error } = await supabase.functions.invoke('cancel-subscription', {
        body: { action },
      });
      if (error) throw error;
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
    if (plans.length > 0 && user && profile) {
      loadSubscription().finally(() => setLoading(false));
    }
  }, [user, plans, profile]);

  useEffect(() => {
    if (profile?.role === 'aluno' && teacherContext && plans.length > 0) {
      loadTeacherSubscriptions();
    }
  }, [teacherContext?.selectedTeacherId, plans, profile]);

  // Stripe return URL handling
  useEffect(() => {
    if (!user) return;

    const urlParams = new URLSearchParams(window.location.search);
    const stripeParams = [
      'success', 'payment_intent', 'payment_intent_client_secret',
      'setup_intent', 'setup_intent_client_secret', 'subscription_id', 'session_id'
    ];

    const hasStripeParams = stripeParams.some(param => urlParams.has(param));

    if (hasStripeParams) {
      console.log('Stripe return detected, refreshing subscription status...');
      
      const verifyAndCleanUrl = async () => {
        try {
          await refreshSubscription();
          const newUrl = new URL(window.location.href);
          stripeParams.forEach(param => newUrl.searchParams.delete(param));
          window.history.replaceState({}, '', newUrl.toString());
        } catch (error) {
          console.error('Error verifying subscription after Stripe return:', error);
        }
      };

      verifyAndCleanUrl();
    }
  }, [user, refreshSubscription]);

  // Daily midnight check
  useEffect(() => {
    if (!user) return;

    const scheduleNextMidnightCheck = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      
      return setTimeout(async () => {
        try { await refreshSubscription(); } catch (error) {
          console.error('Error during midnight subscription check:', error);
        }
        
        const interval = setInterval(async () => {
          try { await refreshSubscription(); } catch (error) {
            console.error('Error during daily subscription check:', error);
          }
        }, 24 * 60 * 60 * 1000);
        
        return interval;
      }, msUntilMidnight);
    };

    const initialTimeout = scheduleNextMidnightCheck();
    return () => clearTimeout(initialTimeout);
  }, [user]);

  const dismissPendingBoleto = () => {
    setPendingBoletoDetected(false);
  };

  return (
    <SubscriptionContext.Provider
      value={{
        currentPlan,
        subscription,
        plans,
        loading,
        needsStudentSelection,
        studentSelectionData,
        pendingBoletoDetected,
        pendingBoletoData,
        hasFeature,
        hasTeacherFeature,
        canAddStudent,
        getStudentOverageInfo,
        refreshSubscription,
        createCheckoutSession,
        cancelSubscription,
        completeStudentSelection,
        dismissPendingBoleto,
        teacherPlanLoading,
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

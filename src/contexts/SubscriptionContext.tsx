import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

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
      // Check subscription via edge function
      const { data, error } = await supabase.functions.invoke('check-subscription-status');
      
      if (error) throw error;

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
      if (profile?.role === 'aluno' && profile?.teacher_id) {
        await loadTeacherSubscription(profile.teacher_id);
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
      // Fallback to free plan
      const freePlan = plans.find(p => p.slug === 'free');
      setCurrentPlan(freePlan || null);
      setSubscription(null);
    }
  };

  const loadTeacherSubscription = async (teacherId: string) => {
    try {
      console.log('🔍 Loading teacher subscription for:', teacherId);
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
      
      console.log('📊 Teacher subscription query result:', { subscriptionData, subscriptionError });
      
      if (subscriptionError && subscriptionError.code !== 'PGRST116') {
        console.error('Error loading teacher subscription:', subscriptionError);
        return;
      }

      if (subscriptionData && subscriptionData.subscription_plans) {
        console.log('✅ Teacher has active subscription:', subscriptionData.subscription_plans);
        setTeacherPlan(subscriptionData.subscription_plans as unknown as SubscriptionPlan);
      } else {
        // Teacher has no active subscription, use free plan
        console.log('⚠️ Teacher has no active subscription, using free plan');
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
      // Call edge function to refresh subscription status
      const { data, error } = await supabase.functions.invoke('check-subscription-status');
      
      if (error) throw error;
      
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
      throw error;
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
    console.log('🎯 hasTeacherFeature called:', { 
      feature, 
      profileRole: profile?.role, 
      teacherPlan: teacherPlan?.name,
      teacherPlanFeatures: teacherPlan?.features 
    });
    
    // For professors, use their own plan
    if (profile?.role === 'professor') {
      return hasFeature(feature);
    }
    
    // For students, check teacher's plan
    if (profile?.role === 'aluno' && teacherPlan) {
      const featureValue = teacherPlan.features[feature];
      const result = typeof featureValue === 'boolean' ? featureValue : Boolean(featureValue);
      console.log('📝 Student feature check result:', { feature, featureValue, result });
      return result;
    }
    
    console.log('❌ hasTeacherFeature returning false - no teacher plan or not student');
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
    const { data, error } = await supabase.functions.invoke('create-subscription-checkout', {
      body: { planSlug }
    });

    if (error) throw error;
    return data.url;
  };

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    if (plans.length > 0) {
      loadSubscription().finally(() => setLoading(false));
    }
  }, [user, plans, profile]);

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
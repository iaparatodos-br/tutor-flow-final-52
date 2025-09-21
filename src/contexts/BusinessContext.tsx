import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from "sonner";

export interface BusinessProfile {
  id: string;
  business_name: string;
  cnpj?: string | null;
  stripe_connect_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface BusinessContextType {
  businessProfiles: BusinessProfile[];
  selectedBusinessProfile: BusinessProfile | null;
  loading: boolean;
  error: string | null;
  setSelectedBusinessProfile: (profile: BusinessProfile | null) => void;
  refreshBusinessProfiles: () => Promise<void>;
  createBusinessProfile: (data: { business_name: string; cnpj?: string }) => Promise<{ success: boolean; onboarding_url?: string; error?: string }>;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isProfessor, loading: authLoading } = useAuth();
  const [businessProfiles, setBusinessProfiles] = useState<BusinessProfile[]>([]);
  const [selectedBusinessProfile, setSelectedBusinessProfileState] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load business profiles from API
  const loadBusinessProfiles = async () => {
    if (!isAuthenticated || !isProfessor || authLoading) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: functionError } = await supabase.functions.invoke('list-business-profiles');
      
      if (functionError) {
        console.error('Error loading business profiles:', functionError);
        setError('Erro ao carregar negócios');
        return;
      }

      if (!data.success) {
        console.error('Function returned error:', data.error);
        setError(data.error || 'Erro ao carregar negócios');
        return;
      }

      const profiles = data.business_profiles || [];
      setBusinessProfiles(profiles);

      // Auto-select first business profile if none selected
      if (profiles.length > 0 && !selectedBusinessProfile) {
        setSelectedBusinessProfileState(profiles[0]);
        localStorage.setItem('selectedBusinessProfileId', profiles[0].id);
      }

    } catch (err) {
      console.error('Exception loading business profiles:', err);
      setError('Erro inesperado ao carregar negócios');
    } finally {
      setLoading(false);
    }
  };

  // Create new business profile
  const createBusinessProfile = async (data: { business_name: string; cnpj?: string }) => {
    if (!isAuthenticated || !isProfessor) {
      return { success: false, error: 'Usuário não autenticado' };
    }

    try {
      const { data: result, error: functionError } = await supabase.functions.invoke('create-business-profile', {
        body: data
      });
      
      if (functionError) {
        console.error('Error creating business profile:', functionError);
        return { success: false, error: 'Erro ao criar negócio' };
      }

      if (!result.success) {
        console.error('Function returned error:', result.error);
        return { success: false, error: result.error || 'Erro ao criar negócio' };
      }

      // Refresh the list after creating
      await loadBusinessProfiles();
      
      toast.success('Negócio criado com sucesso!');
      
      return { 
        success: true, 
        onboarding_url: result.onboarding_url 
      };

    } catch (err) {
      console.error('Exception creating business profile:', err);
      return { success: false, error: 'Erro inesperado ao criar negócio' };
    }
  };

  // Set selected business profile with persistence
  const setSelectedBusinessProfile = (profile: BusinessProfile | null) => {
    setSelectedBusinessProfileState(profile);
    if (profile) {
      localStorage.setItem('selectedBusinessProfileId', profile.id);
    } else {
      localStorage.removeItem('selectedBusinessProfileId');
    }
  };

  // Restore selected business profile from localStorage
  useEffect(() => {
    if (businessProfiles.length > 0) {
      const savedProfileId = localStorage.getItem('selectedBusinessProfileId');
      if (savedProfileId) {
        const savedProfile = businessProfiles.find(bp => bp.id === savedProfileId);
        if (savedProfile) {
          setSelectedBusinessProfileState(savedProfile);
          return;
        }
      }
      
      // If no saved profile or saved profile not found, select first one
      if (!selectedBusinessProfile) {
        setSelectedBusinessProfileState(businessProfiles[0]);
        localStorage.setItem('selectedBusinessProfileId', businessProfiles[0].id);
      }
    }
  }, [businessProfiles]);

  // Load business profiles when authenticated as professor
  useEffect(() => {
    if (isAuthenticated && isProfessor && !authLoading) {
      loadBusinessProfiles();
    } else if (!isAuthenticated || !isProfessor) {
      // Clear state when not authenticated or not professor
      setBusinessProfiles([]);
      setSelectedBusinessProfileState(null);
      setError(null);
      localStorage.removeItem('selectedBusinessProfileId');
    }
  }, [isAuthenticated, isProfessor, authLoading]);

  const value: BusinessContextType = {
    businessProfiles,
    selectedBusinessProfile,
    loading,
    error,
    setSelectedBusinessProfile,
    refreshBusinessProfiles: loadBusinessProfiles,
    createBusinessProfile,
  };

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinessContext() {
  const context = useContext(BusinessContext);
  if (context === undefined) {
    throw new Error('useBusinessContext must be used within a BusinessProvider');
  }
  return context;
}
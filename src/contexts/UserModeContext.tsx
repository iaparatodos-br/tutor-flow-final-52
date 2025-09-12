import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export type UserMode = 'professor' | 'aluno';

interface UserModeContextType {
  currentMode: UserMode;
  availableModes: UserMode[];
  canSwitchMode: boolean;
  switchMode: (mode: UserMode) => void;
  loading: boolean;
}

const UserModeContext = createContext<UserModeContextType | undefined>(undefined);

interface UserModeProviderProps {
  children: ReactNode;
}

export function UserModeProvider({ children }: UserModeProviderProps) {
  const { user, profile, isAuthenticated } = useAuth();
  const [currentMode, setCurrentMode] = useState<UserMode>('professor');
  const [availableModes, setAvailableModes] = useState<UserMode[]>([]);
  const [loading, setLoading] = useState(true);

  // Load user's available modes
  useEffect(() => {
    const loadAvailableModes = async () => {
      if (!isAuthenticated || !user || !profile) {
        setAvailableModes([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const modes: UserMode[] = [];

        // Check if user is a professor (has role = 'professor')
        if (profile.role === 'professor') {
          modes.push('professor');
        }

        // Check if user is also a student (exists in teacher_student_relationships)
        const { data: studentRelations, error } = await supabase
          .from('teacher_student_relationships')
          .select('id')
          .eq('student_id', user.id)
          .limit(1);

        if (!error && studentRelations && studentRelations.length > 0) {
          modes.push('aluno');
        }

        setAvailableModes(modes);

        // Load saved preference or default to profile role
        const savedMode = localStorage.getItem('userMode') as UserMode;
        if (savedMode && modes.includes(savedMode)) {
          setCurrentMode(savedMode);
        } else {
          // Default to professor if available, otherwise first available mode
          const defaultMode = modes.includes('professor') ? 'professor' : modes[0];
          setCurrentMode(defaultMode);
        }
      } catch (error) {
        console.error('Error loading available modes:', error);
        setAvailableModes([profile.role]);
        setCurrentMode(profile.role);
      } finally {
        setLoading(false);
      }
    };

    loadAvailableModes();
  }, [isAuthenticated, user, profile]);

  const switchMode = (mode: UserMode) => {
    if (availableModes.includes(mode)) {
      setCurrentMode(mode);
      localStorage.setItem('userMode', mode);
    }
  };

  const value: UserModeContextType = {
    currentMode,
    availableModes,
    canSwitchMode: availableModes.length > 1,
    switchMode,
    loading
  };

  return (
    <UserModeContext.Provider value={value}>
      {children}
    </UserModeContext.Provider>
  );
}

export const useUserMode = () => {
  const context = useContext(UserModeContext);
  if (context === undefined) {
    throw new Error('useUserMode deve ser usado dentro de um UserModeProvider');
  }
  return context;
};
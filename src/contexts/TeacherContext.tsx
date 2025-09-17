import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Teacher {
  teacher_id: string;
  teacher_name: string;
  teacher_email: string;
  relationship_id: string;
  billing_day: number;
  created_at: string;
}

interface TeacherContextType {
  teachers: Teacher[];
  selectedTeacherId: string | null;
  setSelectedTeacherId: (teacherId: string | null) => void;
  loading: boolean;
  refreshTeachers: () => Promise<void>;
}

const TeacherContext = createContext<TeacherContextType | undefined>(undefined);

interface TeacherProviderProps {
  children: ReactNode;
}

const TEACHER_SELECTION_KEY = 'selectedTeacherId';

const getPersistedTeacherId = (): string | null => {
  try {
    return localStorage.getItem(TEACHER_SELECTION_KEY);
  } catch (error) {
    console.warn('Error reading teacher selection from localStorage:', error);
    return null;
  }
};

const persistTeacherId = (teacherId: string | null): void => {
  try {
    if (teacherId) {
      localStorage.setItem(TEACHER_SELECTION_KEY, teacherId);
      console.log('Teacher selection persisted:', teacherId);
    } else {
      localStorage.removeItem(TEACHER_SELECTION_KEY);
      console.log('Teacher selection cleared from localStorage');
    }
  } catch (error) {
    console.warn('Error persisting teacher selection:', error);
  }
};

export function TeacherProvider({ children }: TeacherProviderProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(() => getPersistedTeacherId());
  const [loading, setLoading] = useState(true);
  const { user, isAluno } = useAuth();

  const handleSetSelectedTeacherId = (teacherId: string | null) => {
    setSelectedTeacherId(teacherId);
    persistTeacherId(teacherId);
  };

  const refreshTeachers = async () => {
    if (!user || !isAluno) {
      setTeachers([]);
      handleSetSelectedTeacherId(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const { data, error } = await supabase.rpc('get_student_teachers', {
        student_user_id: user.id
      });

      if (error) {
        console.error('Error fetching student teachers:', error);
        setTeachers([]);
        handleSetSelectedTeacherId(null);
        return;
      }

      setTeachers(data || []);
      
      const persistedTeacherId = selectedTeacherId;
      
      // Check if persisted teacher is still valid
      if (persistedTeacherId && data && data.find(t => t.teacher_id === persistedTeacherId)) {
        console.log('Using persisted teacher selection:', persistedTeacherId);
        // Selection is already set from localStorage, no need to change
        return;
      }
      
      // Clear invalid selection or auto-select first teacher if no valid selection
      if (data && data.length > 0) {
        if (!persistedTeacherId) {
          console.log('No teacher selected, auto-selecting first teacher:', data[0].teacher_id);
          handleSetSelectedTeacherId(data[0].teacher_id);
        } else {
          console.log('Previously selected teacher no longer available, selecting first teacher:', data[0].teacher_id);
          handleSetSelectedTeacherId(data[0].teacher_id);
        }
      } else {
        console.log('No teachers available, clearing selection');
        handleSetSelectedTeacherId(null);
      }
    } catch (error) {
      console.error('Error in refreshTeachers:', error);
      setTeachers([]);
      handleSetSelectedTeacherId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshTeachers();
  }, [user, isAluno]);

  return (
    <TeacherContext.Provider 
      value={{ 
        teachers, 
        selectedTeacherId, 
        setSelectedTeacherId: handleSetSelectedTeacherId, 
        loading, 
        refreshTeachers 
      }}
    >
      {children}
    </TeacherContext.Provider>
  );
}

export const useTeacherContext = () => {
  const context = useContext(TeacherContext);
  if (context === undefined) {
    throw new Error('useTeacherContext deve ser usado dentro de um TeacherProvider');
  }
  return context;
};
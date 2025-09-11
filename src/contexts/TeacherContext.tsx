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

export function TeacherProvider({ children }: TeacherProviderProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isAluno } = useAuth();

  const refreshTeachers = async () => {
    if (!user || !isAluno) {
      setTeachers([]);
      setSelectedTeacherId(null);
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
        setSelectedTeacherId(null);
        return;
      }

      setTeachers(data || []);
      
      // Auto-select first teacher if none selected and teachers available
      if (data && data.length > 0 && !selectedTeacherId) {
        setSelectedTeacherId(data[0].teacher_id);
      }
      
      // Clear selection if selected teacher is no longer in the list
      if (selectedTeacherId && data && !data.find(t => t.teacher_id === selectedTeacherId)) {
        setSelectedTeacherId(data.length > 0 ? data[0].teacher_id : null);
      }
    } catch (error) {
      console.error('Error in refreshTeachers:', error);
      setTeachers([]);
      setSelectedTeacherId(null);
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
        setSelectedTeacherId, 
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
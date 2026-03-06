import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StudentCountResult {
  totalStudents: number;
  regularStudents: number;
  dependentsCount: number;
  loading: boolean;
  refreshStudentCount: () => Promise<void>;
}

export function useStudentCount(): StudentCountResult {
  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [regularStudents, setRegularStudents] = useState<number>(0);
  const [dependentsCount, setDependentsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStudentCount();
  }, []);

  const loadStudentCount = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use RPC that counts both students and dependents
      const { data, error } = await supabase
        .rpc('count_teacher_students_and_dependents', { p_teacher_id: user.id });
      
      if (!error && data && data.length > 0) {
        const result = data[0];
        setTotalStudents(result.total_students || 0);
        setRegularStudents(result.regular_students || 0);
        setDependentsCount(result.dependents_count || 0);
      } else if (error) {
        console.error('Error loading student count:', error);
      }
    } catch (error) {
      console.error('Error loading student count:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshStudentCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .rpc('count_teacher_students_and_dependents', { p_teacher_id: user.id });
      
      if (!error && data && data.length > 0) {
        const result = data[0];
        setTotalStudents(result.total_students || 0);
        setRegularStudents(result.regular_students || 0);
        setDependentsCount(result.dependents_count || 0);
      }
    } catch (error) {
      console.error('Error refreshing student count:', error);
    }
  };

  return {
    totalStudents,
    regularStudents,
    dependentsCount,
    loading,
    refreshStudentCount
  };
}

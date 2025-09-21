import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useStudentCount() {
  const [studentCount, setStudentCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStudentCount = async () => {
      try {
        setLoading(true);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('teacher_student_relationships')
          .select('id')
          .eq('teacher_id', user.id);
        
        if (!error) {
          setStudentCount(data?.length || 0);
        } else {
          console.error('Error loading student count:', error);
        }
      } catch (error) {
        console.error('Error loading student count:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStudentCount();
  }, []);

  const refreshStudentCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('teacher_student_relationships')
        .select('id')
        .eq('teacher_id', user.id);
      
      if (!error) {
        setStudentCount(data?.length || 0);
      }
    } catch (error) {
      console.error('Error refreshing student count:', error);
    }
  };

  return {
    studentCount,
    loading,
    refreshStudentCount
  };
}
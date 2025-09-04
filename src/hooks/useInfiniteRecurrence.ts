import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RecurrencePattern {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  is_infinite: boolean;
}

interface ClassData {
  id: string;
  class_date: string;
  teacher_id: string;
  student_id?: string;
  service_id?: string;
  duration_minutes: number;
  notes?: string;
  is_experimental: boolean;
  is_group_class: boolean;
  recurrence_pattern?: RecurrencePattern;
}

export const useInfiniteRecurrence = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const getNextDate = useCallback((current: Date, frequency: string) => {
    const next = new Date(current);
    switch (frequency) {
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'biweekly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
    }
    return next;
  }, []);

  const generateMoreClasses = useCallback(async (
    teacherId: string,
    viewEndDate: Date,
    selectedStudents: string[] = []
  ) => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    
    try {
      // Find infinite recurring classes that need more instances
      const { data: recurringClasses, error: queryError } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', teacherId)
        .not('recurrence_pattern', 'is', null)
        .order('class_date', { ascending: false });

      if (queryError) throw queryError;

      const classesToGenerate = [];
      const bufferDays = 14; // Generate 2 weeks beyond the view end date
      const targetEndDate = new Date(viewEndDate.getTime() + (bufferDays * 24 * 60 * 60 * 1000));

      for (const recurringClass of recurringClasses || []) {
        const pattern = recurringClass.recurrence_pattern as unknown as RecurrencePattern;
        
        if (!pattern?.is_infinite) continue;

        // Find the last occurrence of this recurring series
        const { data: lastOccurrence, error: lastError } = await supabase
          .from('classes')
          .select('class_date')
          .eq('teacher_id', teacherId)
          .eq('service_id', recurringClass.service_id)
          .eq('duration_minutes', recurringClass.duration_minutes)
          .eq('is_experimental', recurringClass.is_experimental)
          .eq('is_group_class', recurringClass.is_group_class)
          .order('class_date', { ascending: false })
          .limit(1);

        if (lastError) continue;

        if (!lastOccurrence?.[0]) continue;

        const lastDate = new Date(lastOccurrence[0].class_date);
        
        // Check if we need to generate more classes
        if (lastDate >= targetEndDate) continue;

        // Generate classes from last date to target end date
        let currentDate = new Date(lastDate);
        const maxNewClasses = 20; // Limit per batch to avoid overwhelming the system
        let generatedCount = 0;

        while (currentDate < targetEndDate && generatedCount < maxNewClasses) {
          currentDate = getNextDate(currentDate, pattern.frequency);
          
          if (currentDate >= targetEndDate) break;

          classesToGenerate.push({
            teacher_id: recurringClass.teacher_id,
            student_id: recurringClass.student_id,
            service_id: recurringClass.service_id,
            class_date: currentDate.toISOString(),
            duration_minutes: recurringClass.duration_minutes,
            notes: recurringClass.notes,
            status: 'pendente',
            is_experimental: recurringClass.is_experimental,
            is_group_class: recurringClass.is_group_class,
            recurrence_pattern: pattern
          });

          generatedCount++;
        }
      }

      // Insert new classes if any were generated
      if (classesToGenerate.length > 0) {
        const { data: insertedClasses, error: insertError } = await supabase
          .from('classes')
          .insert(classesToGenerate)
          .select();

        if (insertError) throw insertError;

        // Insert participants for group classes
        if (selectedStudents.length > 0 && insertedClasses) {
          const participantInserts = [];
          for (const classData of insertedClasses) {
            for (const studentId of selectedStudents) {
              participantInserts.push({
                class_id: classData.id,
                student_id: studentId
              });
            }
          }

          if (participantInserts.length > 0) {
            const { error: participantError } = await supabase
              .from('class_participants')
              .insert(participantInserts);

            if (participantError) {
              console.error('Error inserting participants:', participantError);
            }
          }
        }

        console.log(`Generated ${classesToGenerate.length} new recurring classes`);
      }

      return classesToGenerate.length;
    } catch (error) {
      console.error('Error generating more classes:', error);
      toast({
        title: "Erro ao gerar aulas",
        description: "Não foi possível gerar mais aulas recorrentes automaticamente",
        variant: "destructive",
      });
      return 0;
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, getNextDate, toast]);

  const checkAndGenerateClasses = useCallback(async (
    teacherId: string,
    calendarViewStart: Date,
    calendarViewEnd: Date,
    selectedStudents: string[] = []
  ) => {
    // Only generate if we're viewing future dates
    const now = new Date();
    if (calendarViewEnd <= now) return 0;

    return await generateMoreClasses(teacherId, calendarViewEnd, selectedStudents);
  }, [generateMoreClasses]);

  return {
    generateMoreClasses,
    checkAndGenerateClasses,
    isGenerating
  };
};
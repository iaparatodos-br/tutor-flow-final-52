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
      default:
        console.warn(`Unknown frequency: ${frequency}, defaulting to weekly`);
        next.setDate(next.getDate() + 7);
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
      // Find infinite recurring template classes (parent_class_id is null and is_infinite is true)
      const { data: templateClasses, error: queryError } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', teacherId)
        .is('parent_class_id', null)
        .not('recurrence_pattern', 'is', null);

      if (queryError) throw queryError;

      const classesToGenerate = [];
      const bufferDays = 14; // Generate 2 weeks beyond the view end date
      const targetEndDate = new Date(viewEndDate.getTime() + (bufferDays * 24 * 60 * 60 * 1000));

      for (const templateClass of templateClasses || []) {
        const pattern = templateClass.recurrence_pattern as unknown as RecurrencePattern;
        
        // Only process infinite recurring patterns
        if (!pattern?.is_infinite || !pattern?.frequency) {
          console.log(`Skipping template ${templateClass.id}: not infinite or missing frequency`);
          continue;
        }

        // Find the last occurrence of this recurring series
        const { data: lastOccurrence, error: lastError } = await supabase
          .from('classes')
          .select('class_date')
          .or(`id.eq.${templateClass.id},parent_class_id.eq.${templateClass.id}`)
          .order('class_date', { ascending: false })
          .limit(1);

        if (lastError) {
          console.error(`Error finding last occurrence for template ${templateClass.id}:`, lastError);
          continue;
        }

        if (!lastOccurrence?.[0]) {
          console.log(`No last occurrence found for template ${templateClass.id}`);
          continue;
        }

        const lastDate = new Date(lastOccurrence[0].class_date);
        
        // Check if we need to generate more classes
        if (lastDate >= targetEndDate) {
          console.log(`No more classes needed for template ${templateClass.id}: lastDate ${lastDate.toISOString()} >= targetEndDate ${targetEndDate.toISOString()}`);
          continue;
        }

        // Generate classes from last date to target end date
        let currentDate = new Date(lastDate);
        const maxNewClasses = 20; // Limit per batch to avoid overwhelming the system
        let generatedCount = 0;
        const newDates: string[] = [];
        const templateNewClasses: any[] = [];

        while (currentDate < targetEndDate && generatedCount < maxNewClasses) {
          const nextDate = getNextDate(currentDate, pattern.frequency || 'weekly');
          
          // Safety check: ensure we're actually advancing
          if (nextDate.getTime() <= currentDate.getTime()) {
            console.error(`Date not advancing for frequency ${pattern.frequency}. Breaking loop.`);
            break;
          }
          
          currentDate = nextDate;
          
          if (currentDate >= targetEndDate) break;

          // Check if this date already exists in local generation for this series
          const dateString = currentDate.toISOString();
          if (newDates.includes(dateString)) {
            console.log(`Duplicate date ${dateString} detected, skipping`);
            continue;
          }
          
          newDates.push(dateString);

          templateNewClasses.push({
            teacher_id: templateClass.teacher_id,
            student_id: templateClass.student_id,
            service_id: templateClass.service_id,
            class_date: dateString,
            duration_minutes: templateClass.duration_minutes,
            notes: templateClass.notes,
            status: 'pendente',
            is_experimental: templateClass.is_experimental,
            is_group_class: templateClass.is_group_class,
            parent_class_id: templateClass.id, // Link to the template
            recurrence_pattern: null // Only template has the pattern
          });

          generatedCount++;
        }
        
        console.log(`Generated ${generatedCount} new classes for template ${templateClass.id}`);

        // Filter out occurrences that already exist in DB for this template
        if (templateNewClasses.length > 0) {
          try {
            const { data: existing, error: existingError } = await supabase
              .from('classes')
              .select('class_date')
              .eq('parent_class_id', templateClass.id)
              .in('class_date', newDates);

            if (existingError) {
              console.warn('Failed to check existing occurrences; proceeding without filter:', existingError);
              classesToGenerate.push(...templateNewClasses);
            } else {
              const existingSet = new Set((existing || []).map(e => new Date(e.class_date as unknown as string).toISOString()));
              const filtered = templateNewClasses.filter(c => !existingSet.has(c.class_date));
              classesToGenerate.push(...filtered);
            }
          } catch (e) {
            console.warn('Error filtering existing occurrences, proceeding without filter:', e);
            classesToGenerate.push(...templateNewClasses);
          }
        }
      }

      // Insert new classes if any were generated (filtered to avoid duplicates)
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
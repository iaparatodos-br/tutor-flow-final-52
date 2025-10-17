import { useEffect, useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { SimpleCalendar } from "@/components/Calendar/SimpleCalendar";
import { CalendarClass, AvailabilityBlock } from "@/components/Calendar/CalendarView";
import { AvailabilityManager } from "@/components/Availability/AvailabilityManager";
import { ClassForm } from "@/components/ClassForm/ClassForm";
import { CancellationModal } from "@/components/CancellationModal";
import { ClassReportModal } from "@/components/ClassReportModal";
import { StudentScheduleRequest } from "@/components/StudentScheduleRequest";
import { RRule, Frequency } from 'rrule';
import { useTeacherContext } from "@/contexts/TeacherContext";
import { useTranslation } from "react-i18next";
import { Info, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
interface ClassWithParticipants {
  id: string;
  class_date: string;
  duration_minutes: number;
  status: 'pendente' | 'confirmada' | 'cancelada' | 'concluida' | 'removida';
  notes: string | null;
  is_experimental: boolean;
  is_group_class: boolean;
  
  recurrence_pattern?: any;
  student_id?: string;
  service_id?: string;
  teacher_id?: string;
  isVirtual?: boolean;
  is_template?: boolean;
  class_template_id?: string;
  recurrence_end_date?: string;
  participants: Array<{
    student_id: string;
    status?: 'pendente' | 'confirmada' | 'cancelada' | 'concluida' | 'removida';
    cancelled_at?: string;
    charge_applied?: boolean;
    confirmed_at?: string;
    completed_at?: string;
    cancellation_reason?: string;
    billed?: boolean;
    student: {
      name: string;
      email: string;
    };
  }>;
}
interface Student {
  id: string;
  name: string;
}
interface ClassService {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}
export default function Agenda() {
  const {
    profile,
    isProfessor,
    isAluno
  } = useProfile();
  const {
    loading: authLoading
  } = useAuth();
  const {
    hasFeature,
    hasTeacherFeature
  } = useSubscription();
  const {
    toast
  } = useToast();
  const {
    selectedTeacherId,
    loading: teacherContextLoading
  } = useTeacherContext();
  const {
    t
  } = useTranslation('classes');
  const [classes, setClasses] = useState<ClassWithParticipants[]>([]);
  const [calendarClasses, setCalendarClasses] = useState<CalendarClass[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [services, setServices] = useState<ClassService[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleRange, setVisibleRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellationModal, setCancellationModal] = useState<{
    isOpen: boolean;
    classId: string;
    className: string;
    classDate: string;
  }>({
    isOpen: false,
    classId: "",
    className: "",
    classDate: ""
  });
  const [reportModal, setReportModal] = useState<{
    isOpen: boolean;
    classData: CalendarClass | null;
  }>({
    isOpen: false,
    classData: null
  });

  const [showBillingAlert, setShowBillingAlert] = useState(true);
  const [materializingClasses, setMaterializingClasses] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!authLoading && profile) {
      // Initial load with default range (current month)
      if (!visibleRange) {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const startGrid = new Date(firstDay);
        startGrid.setDate(startGrid.getDate() - firstDay.getDay());
        const endGrid = new Date(startGrid);
        endGrid.setDate(endGrid.getDate() + 41);
        setVisibleRange({
          start: startGrid,
          end: endGrid
        });
        loadClasses(startGrid, endGrid);
      }
      if (isProfessor) {
        loadStudents();
        loadAvailabilityBlocks();
        loadServices();
      }
    }
  }, [profile, isProfessor, authLoading]);

  // Reload data when selectedTeacherId changes (for students)
  useEffect(() => {
    if (isAluno && selectedTeacherId && visibleRange) {
      loadClasses(visibleRange.start, visibleRange.end);
    }
  }, [selectedTeacherId, isAluno]);

  // Load classes when visible range changes
  useEffect(() => {
    if (visibleRange && profile) {
      loadClasses(visibleRange.start, visibleRange.end);
    }
  }, [visibleRange]);
  const handleVisibleRangeChange = (start: Date, end: Date) => {
    setVisibleRange({
      start,
      end
    });
  };

  // Helper function to generate virtual recurring instances for visible range
  const generateVirtualInstances = (templateClass: ClassWithParticipants, startDate: Date, endDate: Date): ClassWithParticipants[] => {
    if (!templateClass.recurrence_pattern?.is_infinite) return [];
    
    // Respeitar recurrence_end_date
    let effectiveEndDate = endDate;
    if (templateClass.recurrence_end_date) {
      const recurrenceEnd = new Date(templateClass.recurrence_end_date);
      if (recurrenceEnd < effectiveEndDate) {
        effectiveEndDate = recurrenceEnd;
      }
    }
    
    const pattern = templateClass.recurrence_pattern;
    const freq = pattern.frequency === 'weekly' ? Frequency.WEEKLY : pattern.frequency === 'biweekly' ? Frequency.WEEKLY : pattern.frequency === 'monthly' ? Frequency.MONTHLY : Frequency.WEEKLY;
    const interval = pattern.frequency === 'biweekly' ? 2 : 1;
    const rule = new RRule({
      freq,
      interval,
      dtstart: new Date(templateClass.class_date),
      until: effectiveEndDate
    });

    // Generate occurrences only within the visible range
    const occurrences = rule.between(startDate, effectiveEndDate, true);

    // Filter out the original template date if it's in range
    const templateDate = new Date(templateClass.class_date);
    const filteredOccurrences = occurrences.filter(date => date.getTime() !== templateDate.getTime());
    return filteredOccurrences.map(date => ({
      ...templateClass,
      id: `${templateClass.id}_virtual_${date.getTime()}`,
      class_date: date.toISOString(),
      isVirtual: true,
      is_template: false,
      class_template_id: templateClass.id,
      status: 'confirmada' as const
    }));
  };
  const loadClasses = async (rangeStart?: Date, rangeEnd?: Date) => {
    if (!profile?.id) return;
    try {
      // Use provided range or fallback to default range
      const startDate = rangeStart || new Date();
      const endDate = rangeEnd || (() => {
        const end = new Date(startDate);
        end.setMonth(end.getMonth() + 1);
        return end;
      })();

      // Use RPC to get optimized data for professors
      let data;
      let error;
      if (isProfessor) {
        ({
          data,
          error
        } = await supabase.rpc('get_calendar_events', {
          p_teacher_id: profile.id,
          p_start_date: startDate.toISOString(),
          p_end_date: endDate.toISOString()
        }));
      } else {
        // For students, get classes where they are active participants
        let query = supabase.from('classes').select(`
            id,
            class_date,
            duration_minutes,
            status,
            notes,
            is_experimental,
            is_group_class,
            student_id,
            service_id,
            teacher_id,
            recurrence_pattern,
            profiles!classes_student_id_fkey (
              name,
              email
            ),
            class_participants!inner (
              student_id,
              status,
              cancelled_at,
              charge_applied,
              confirmed_at,
              completed_at,
              cancellation_reason,
              billed,
              profiles!class_participants_student_id_fkey (
                name,
                email
              )
            )
          `).eq('class_participants.student_id', profile.id).in('class_participants.status', ['pendente', 'confirmada', 'concluida']).gte('class_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).order('class_date');

        // Execute two separate queries to avoid PostgREST or() limitations with joins
        const [individualClassesResult, groupClassesResult] = await Promise.all([
        // Query 1: Individual classes where student_id matches
        (() => {
          let individualQuery = supabase.from('classes').select(`
                id,
                class_date,
                duration_minutes,
                status,
                notes,
                is_experimental,
                is_group_class,
                student_id,
                service_id,
                teacher_id,
                recurrence_pattern,
                profiles!classes_student_id_fkey (
                  name,
                  email
                ),
                class_participants (
                  student_id,
                  profiles!class_participants_student_id_fkey (
                    name,
                    email
                  )
                )
              `).eq('student_id', profile.id).gte('class_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).order('class_date');
          if (selectedTeacherId) {
            individualQuery = individualQuery.eq('teacher_id', selectedTeacherId);
          }
          return individualQuery;
        })(),
        // Query 2: Group classes where user is a participant
        (() => {
          let groupQuery = supabase.from('classes').select(`
                id,
                class_date,
                duration_minutes,
                status,
                notes,
                is_experimental,
                is_group_class,
                student_id,
                service_id,
                teacher_id,
                
                recurrence_pattern,
                profiles!classes_student_id_fkey (
                  name,
                  email
                ),
                class_participants!inner (
                  student_id,
                  profiles!class_participants_student_id_fkey (
                    name,
                    email
                  )
                )
              `).eq('class_participants.student_id', profile.id).gte('class_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).order('class_date');
          if (selectedTeacherId) {
            groupQuery = groupQuery.eq('teacher_id', selectedTeacherId);
          }
          return groupQuery;
        })()]);

        // Handle errors from either query
        if (individualClassesResult.error) {
          console.error('Error loading individual classes:', individualClassesResult.error);
          throw individualClassesResult.error;
        }
        if (groupClassesResult.error) {
          console.error('Error loading group classes:', groupClassesResult.error);
          throw groupClassesResult.error;
        }

        // Combine results and remove duplicates
        const allClasses = [...(individualClassesResult.data || []), ...(groupClassesResult.data || [])];

        // Remove duplicates based on class id
        const uniqueClasses = allClasses.filter((cls, index, arr) => arr.findIndex(c => c.id === cls.id) === index);
        data = uniqueClasses;
        error = null;
      }
      if (error) {
        console.error('Error loading classes:', error);
        throw error;
      }

      // Separar templates de aulas materializadas
      const templates = (data || []).filter((c: any) => c.is_template === true);
      const materializedClasses = (data || []).filter((c: any) => c.is_template !== true);

      // Fetch related data for each materialized class (only for RPC results)
      let classesWithDetails;
      if (isProfessor) {
        classesWithDetails = await Promise.all(materializedClasses.map(async (cls: any) => {
          const [studentsData, participantsData] = await Promise.all([
          // Get student data for individual classes
          cls.student_id ? supabase.from('profiles').select('id, name, email').eq('id', cls.student_id).maybeSingle() : Promise.resolve({
            data: null
          }),
          // Get participants for group classes
          cls.is_group_class ? supabase.from('class_participants').select(`
                student_id,
                profiles!class_participants_student_id_fkey (
                  id, name, email
                )
              `).eq('class_id', cls.id) : Promise.resolve({
            data: []
          })]);
          const participants = cls.is_group_class ? (participantsData.data || []).map((p: any) => ({
            student_id: p.student_id,
            student: p.profiles
          })) : studentsData.data ? [{
            student_id: studentsData.data.id,
            student: studentsData.data
          }] : [];
          return {
            ...cls,
            participants
          };
        }));
      } else {
        // For students, data already comes with relations
        classesWithDetails = materializedClasses.map((item: any) => {
          const participants = item.is_group_class ? item.class_participants.map((p: any) => ({
            student_id: p.student_id,
            student: p.profiles
          })) : item.student_id && item.profiles ? [{
            student_id: item.student_id,
            student: item.profiles
          }] : [];
          return {
            ...item,
            participants
          };
        });
      }

      // Generate virtual instances for infinite recurrences from TEMPLATES (only for professors)
      const allClasses: ClassWithParticipants[] = [...classesWithDetails];
      if (isProfessor) {
        // Process each template to generate virtual instances
        for (const template of templates) {
          // Check if recurrence is still active
          if (template.recurrence_end_date) {
            const templateEndDate = new Date(template.recurrence_end_date);
            if (templateEndDate < startDate) {
              continue; // Template already ended
            }
          }

          const virtualInstances = generateVirtualInstances(template, startDate, endDate);
          
          // Filter out virtual instances that conflict with materialized classes
          const materializedDates = new Set(
            classesWithDetails
              .filter((c: any) => c.class_template_id === template.id)
              .map((c: any) => new Date(c.class_date).toISOString())
          );
          
          const filteredVirtual = virtualInstances.filter(
            v => !materializedDates.has(v.class_date)
          );
          
          allClasses.push(...filteredVirtual);
        }
      }
      setClasses(allClasses);

      // Transform for calendar view
      const calendarEvents: CalendarClass[] = allClasses
        .filter(cls => !cls.is_template) // Não mostrar templates na agenda
        .filter(cls => {
        // For students, show only classes with active participation
        if (!isProfessor && cls.participants.length > 0) {
          const myParticipation = cls.participants.find(p => p.student_id === profile.id);
          return myParticipation && ['pendente', 'confirmada', 'concluida'].includes(myParticipation.status || cls.status);
        }
        return true;
      }).map(cls => {
        const calendarStartDate = new Date(cls.class_date);
        const calendarEndDate = new Date(calendarStartDate.getTime() + cls.duration_minutes * 60 * 1000);
        const participantNames = cls.participants.map(p => p.student.name).join(', ');
        const titleSuffix = cls.is_experimental ? ' (Experimental)' : '';
        const groupIndicator = cls.is_group_class ? ` [${cls.participants.length} alunos]` : '';
        const virtualSuffix = cls.isVirtual ? ' (Recorrente)' : '';

        // Determine display status for students
        let displayStatus = cls.status;
        if (!isProfessor && cls.participants.length > 0) {
          const myParticipation = cls.participants.find(p => p.student_id === profile.id);
          displayStatus = myParticipation?.status || cls.status;
        }
        return {
          id: cls.id,
          title: `${participantNames}${groupIndicator} - ${cls.duration_minutes}min${titleSuffix}${virtualSuffix}`,
          start: calendarStartDate,
          end: calendarEndDate,
          status: displayStatus,
          student: cls.participants[0]?.student || {
            name: 'Sem aluno',
            email: ''
          },
          participants: cls.participants,
          notes: cls.notes || undefined,
          is_experimental: cls.is_experimental,
          is_group_class: cls.is_group_class,
          isVirtual: cls.isVirtual,
          class_template_id: cls.class_template_id
        };
      });
      setCalendarClasses(calendarEvents);
    } catch (error) {
      console.error('Erro ao carregar aulas:', error);
      toast({
        title: t('messages.loadError'),
        description: t('messages.loadErrorDescription'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const loadAvailabilityBlocks = async () => {
    if (!profile?.id || !isProfessor) return;
    try {
      const {
        data,
        error
      } = await supabase.from('availability_blocks').select('*').eq('teacher_id', profile.id).gte('end_datetime', new Date().toISOString()).order('start_datetime');
      if (error) {
        console.error('Erro ao carregar bloqueios:', error);
        return;
      }
      const blocks: AvailabilityBlock[] = (data || []).map(block => ({
        id: block.id,
        title: block.title,
        start: new Date(block.start_datetime),
        end: new Date(block.end_datetime),
        type: 'block' as const
      }));
      setAvailabilityBlocks(blocks);
    } catch (error) {
      console.error('Erro ao carregar bloqueios:', error);
    }
  };
  const loadStudents = async () => {
    if (!profile?.id) return;
    try {
      const {
        data,
        error
      } = await supabase.rpc('get_teacher_students', {
        teacher_user_id: profile.id
      });
      if (error) {
        console.error('Erro ao carregar alunos:', error);
        return;
      }
      const mapped = (data || []).map((s: any) => ({
        id: s.student_id,
        name: s.student_name
      }));
      setStudents(mapped);
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
    }
  };
  const loadServices = async () => {
    if (!profile?.id) return;
    try {
      const {
        data,
        error
      } = await supabase.from('class_services').select('id, name, price, duration_minutes').eq('teacher_id', profile.id).eq('is_active', true).order('is_default', {
        ascending: false
      }).order('name');
      if (error) {
        console.error('Erro ao carregar serviços:', error);
        return;
      }
      setServices(data || []);
    } catch (error) {
      console.error('Erro ao carregar serviços:', error);
    }
  };
  const handleConfirmClass = async (classId: string) => {
    try {
      // Check if it's a virtual instance (needs materialization)
      if (classId.includes('_virtual_')) {
        await materializeVirtualClass(classId);
        return;
      }
      const {
        error
      } = await supabase.from('classes').update({
        status: 'confirmada'
      }).eq('id', classId);
      if (error) throw error;
      toast({
        title: t('messages.classConfirmed'),
        description: t('messages.classConfirmedDescription')
      });
      if (visibleRange) {
        loadClasses(visibleRange.start, visibleRange.end);
      }
    } catch (error: any) {
      console.error('Erro ao confirmar aula:', error);
      toast({
        title: "Erro ao confirmar aula",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    }
  };
  const materializeVirtualClass = async (virtualId: string, targetStatus: 'confirmada' | 'concluida' = 'confirmada'): Promise<string> => {
    // Verificar se já está sendo materializada
    if (materializingClasses.has(virtualId)) {
      throw new Error('Esta aula já está sendo processada');
    }

    setMaterializingClasses(prev => new Set(prev).add(virtualId));

    try {
      // Find the virtual class in our current state
      const virtualClass = classes.find(cls => cls.id === virtualId);
      if (!virtualClass || !virtualClass.isVirtual) {
        throw new Error('Virtual class not found');
      }

      // Get template ID from class_template_id or parse from virtual ID
      const templateId = virtualClass.class_template_id || virtualId.split('_virtual_')[0];

      // Create real class from virtual instance with specified status
      const realClassData = {
        teacher_id: profile?.id,
        student_id: virtualClass.student_id,
        service_id: virtualClass.service_id,
        class_date: virtualClass.class_date,
        duration_minutes: virtualClass.duration_minutes,
        notes: virtualClass.notes,
        status: targetStatus,
        is_experimental: virtualClass.is_experimental,
        is_group_class: virtualClass.is_group_class,
        is_template: false,
        class_template_id: templateId,
        parent_class_id: null
      };
      const {
        data: newClass,
        error
      } = await supabase.from('classes').insert([realClassData]).select().single();
      if (error) throw error;

      // Insert participants if it's a group class with matching status
      if (virtualClass.is_group_class && virtualClass.participants.length > 0) {
        const participantInserts = virtualClass.participants.map(p => ({
          class_id: newClass.id,
          student_id: p.student_id,
          status: targetStatus
        }));
        const {
          error: participantError
        } = await supabase.from('class_participants').insert(participantInserts);
        if (participantError) throw participantError;
      }

      const statusMessages = {
        confirmada: {
          title: "Aula confirmada!",
          description: "A aula recorrente foi confirmada e agendada"
        },
        concluida: {
          title: t('messages.classCompleted'),
          description: t('messages.classCompletedDescription')
        }
      };

      toast(statusMessages[targetStatus]);

      if (visibleRange) {
        loadClasses(visibleRange.start, visibleRange.end);
      }

      return newClass.id;
    } catch (error: any) {
      console.error('Erro ao materializar aula virtual:', error);
      toast({
        title: "Erro ao processar aula",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
      throw error;
    } finally {
      setMaterializingClasses(prev => {
        const next = new Set(prev);
        next.delete(virtualId);
        return next;
      });
    }
  };
  const generateRecurringClasses = (baseClass: any, recurrence: any) => {
    const classes = [baseClass];

    // Normalize frequency to handle undefined values
    const normalizedFrequency = recurrence.frequency || 'weekly';

    // For finite recurrence, generate all instances
    const startDate = new Date(baseClass.class_date);
    let currentDate = new Date(startDate);
    const getNextDate = (current: Date, frequency: string) => {
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
    };
    const endDate = recurrence.end_date ? new Date(recurrence.end_date) : null;
    const maxOccurrences = recurrence.occurrences || 50;
    for (let i = 1; i < maxOccurrences; i++) {
      const nextDate = getNextDate(currentDate, normalizedFrequency);

      // Safety check: ensure date is advancing
      if (nextDate.getTime() <= currentDate.getTime()) {
        console.error(`Date not advancing for frequency ${normalizedFrequency}. Breaking loop.`);
        break;
      }

      // Check if we've reached the end date
      if (endDate && nextDate > endDate) {
        break;
      }
      currentDate = nextDate;
      classes.push({
        ...baseClass,
        class_date: currentDate.toISOString(),
        status: 'confirmada' // Ensure all recurring classes are confirmed by default
      });
    }
    return classes;
  };
  // Helper to calculate end date from number of occurrences
  const calculateEndDateFromOccurrences = (
    startDate: Date,
    frequency: 'weekly' | 'biweekly' | 'monthly',
    occurrences: number
  ): string => {
    const endDate = new Date(startDate);
    
    if (frequency === 'weekly') {
      endDate.setDate(endDate.getDate() + (occurrences * 7));
    } else if (frequency === 'biweekly') {
      endDate.setDate(endDate.getDate() + (occurrences * 14));
    } else if (frequency === 'monthly') {
      endDate.setMonth(endDate.getMonth() + occurrences);
    }
    
    return endDate.toISOString();
  };

  const handleClassSubmit = async (formData: any) => {
    if (!profile?.id) return;
    setSubmitting(true);
    try {
      const classDateTime = new Date(`${formData.class_date}T${formData.time}`);

      // Create base class data
      const baseClassData = {
        teacher_id: profile.id,
        student_id: formData.is_group_class ? null : formData.selectedStudents[0] || null,
        service_id: formData.service_id || null,
        class_date: classDateTime.toISOString(),
        duration_minutes: formData.duration_minutes,
        notes: formData.notes || null,
        status: 'confirmada',
        // Professor-created classes are confirmed by default
        is_experimental: formData.is_experimental, // Use form value directly
        is_group_class: formData.is_group_class,
        recurrence_pattern: formData.recurrence ? formData.recurrence : null
      };
      let insertedClasses;
      if (formData.recurrence) {
        // Calculate recurrence_end_date for finite recurrences
        let recurrenceEndDate = null;
        if (!formData.recurrence.is_infinite) {
          if (formData.recurrence.end_date) {
            recurrenceEndDate = new Date(formData.recurrence.end_date).toISOString();
          } else if (formData.recurrence.occurrences) {
            // Calculate end date based on number of occurrences
            recurrenceEndDate = calculateEndDateFromOccurrences(
              classDateTime,
              formData.recurrence.frequency,
              formData.recurrence.occurrences
            );
          }
        }

        // Always create a single template for any recurring class (infinite or finite)
        const templateData = {
          ...baseClassData,
          is_template: true,
          recurrence_pattern: formData.recurrence,
          recurrence_end_date: recurrenceEndDate
        };
        
        const {
          data: templateClass,
          error: templateError
        } = await supabase.from('classes').insert([templateData]).select().single();
        if (templateError) throw templateError;
        insertedClasses = [templateClass];
      } else {
        // Single class
        const {
          data: classes,
          error: classError
        } = await supabase.from('classes').insert([baseClassData]).select();
        if (classError) throw classError;
        insertedClasses = classes;
      }

      // Insert participants for all classes (individual and group)
      if (formData.selectedStudents.length > 0) {
        for (const classInstance of insertedClasses) {
          const participantInserts = formData.selectedStudents.map((studentId: string) => ({
            class_id: classInstance.id,
            student_id: studentId,
            status: 'confirmada' // Professor-created classes are confirmed by default
          }));
          const {
            error: participantError
          } = await supabase.from('class_participants').insert(participantInserts);
          if (participantError) {
            console.error('Error inserting participants:', participantError);
            throw participantError;
          }
        }
      }
      if (formData.recurrence) {
        toast({
          title: t('messages.recurringConfirmed'),
          description: "A série de aulas foi criada e aparecerá automaticamente na agenda."
        });
      } else {
        toast({
          title: t('messages.singleScheduled'),
          description: t('messages.singleScheduledDescription')
        });
      }
      if (visibleRange) {
        loadClasses(visibleRange.start, visibleRange.end);
      }
    } catch (error: any) {
      console.error('Erro ao criar aula:', error);
      toast({
        title: "Erro ao agendar aula",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };
  const handleCompleteClass = async (classId: string) => {
    try {
      // Se for aula virtual, materializar primeiro com status 'concluida'
      if (classId.includes('_virtual_')) {
        await materializeVirtualClass(classId, 'concluida');
        return;
      }

      const {
        error
      } = await supabase.from('classes').update({
        status: 'concluida'
      }).eq('id', classId);
      if (error) throw error;
      toast({
        title: t('messages.classCompleted'),
        description: t('messages.classCompletedDescription')
      });
      if (visibleRange) {
        loadClasses(visibleRange.start, visibleRange.end);
      }
    } catch (error: any) {
      console.error('Erro ao concluir aula:', error);
      toast({
        title: "Erro ao concluir aula",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    }
  };

  // Função para encerrar recorrência
  const handleEndRecurrence = async (templateId: string, endDate: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('end-recurrence', {
        body: {
          templateId,
          endDate
        }
      });

      if (error) throw error;

      toast({
        title: "Recorrência encerrada",
        description: `${data.deletedCount} aulas futuras foram removidas`,
      });

      // Recarregar agenda
      if (visibleRange) {
        loadClasses(visibleRange.start, visibleRange.end);
      }

    } catch (error: any) {
      console.error('Erro ao encerrar recorrência:', error);
      toast({
        title: "Erro ao encerrar recorrência",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    }
  };

  // Nova função para gerenciar relatórios
  const handleManageReport = async (classData: CalendarClass) => {
    let finalClassId = classData.id;
    let finalClassData = classData;

    // Se for virtual, materializar primeiro
    if (classData.isVirtual && classData.id.includes('_virtual_')) {
      try {
        // Materializar com status 'concluida' se já estiver concluída, senão 'confirmada'
        const materializedStatus: 'confirmada' | 'concluida' = classData.status === 'concluida' ? 'concluida' : 'confirmada';
        finalClassId = await materializeVirtualClass(classData.id, materializedStatus);
        // Atualizar dados da classe com o novo ID
        finalClassData = {
          ...classData,
          id: finalClassId,
          isVirtual: false
        };
      } catch (error) {
        // Erro já tratado em materializeVirtualClass
        return;
      }
    }

    setReportModal({
      isOpen: true,
      classData: finalClassData
    });
  };

  // Handle recurring class actions
  const handleRecurringClassEdit = (classData: CalendarClass) => {
    // For virtual instances, materialize before editing
    if (classData.isVirtual) {
      console.log('Cannot edit virtual class directly. Materialize first or add notes to materialize.');
    } else {
      console.log('Edit normal class:', classData);
    }
  };

  const handleRecurringClassCancel = (classId: string, className: string, classDate: string) => {
    // Always use normal cancellation modal
    setCancellationModal({
      isOpen: true,
      classId,
      className,
      classDate
    });
  };
  if (loading) {
    return <Layout>
        <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-6">
          <Card>
            <CardContent className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p>Carregando agenda...</p>
              </div>
        </CardContent>
      </Card>
        </div>
      </Layout>;
  }
  return <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Agenda</h1>
          {isProfessor}
        </div>

        {/* Schedule Request Component for Students */}
        {isAluno && !teacherContextLoading && selectedTeacherId && <>
            {console.log('🎓 Rendering StudentScheduleRequest with teacherId:', selectedTeacherId)}
            <StudentScheduleRequest teacherId={selectedTeacherId} />
          </>}
        
        {/* Message for students without teacher selected */}
        {isAluno && !teacherContextLoading && !selectedTeacherId && <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Selecione um Professor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Por favor, selecione um professor no menu lateral para visualizar a agenda e solicitar aulas.
              </p>
            </CardContent>
          </Card>}

        {/* Billing Info Alert for Professors with Financial Module */}
        {isProfessor && hasFeature('financial_module') && showBillingAlert && <Alert className="bg-primary/5 border-primary/20 relative pr-12">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm text-muted-foreground">
              {t('messages.billingInfo')}
            </AlertDescription>
            <Button variant="ghost" size="sm" onClick={() => setShowBillingAlert(false)} className="absolute right-3 top-3 h-7 w-7 p-0 hover:bg-primary/10 mx-[4px]">
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </Alert>}

        <SimpleCalendar 
          classes={calendarClasses} 
          availabilityBlocks={availabilityBlocks} 
          onConfirmClass={handleConfirmClass} 
          onCancelClass={handleRecurringClassCancel} 
          onCompleteClass={(classData: CalendarClass) => handleCompleteClass(classData.id)} 
          onManageReport={handleManageReport} 
          onEndRecurrence={handleEndRecurrence}
          isProfessor={isProfessor} 
          loading={loading} 
          onScheduleClass={() => setIsDialogOpen(true)} 
          onVisibleRangeChange={handleVisibleRangeChange} 
        />

        {/* Availability Manager for Professors */}
        {isProfessor && <AvailabilityManager />}

        {/* Class Form Dialog */}
        <ClassForm open={isDialogOpen} onOpenChange={setIsDialogOpen} onSubmit={handleClassSubmit} students={students} services={services} existingClasses={classes} />

        {/* Cancellation Modal */}
        <CancellationModal isOpen={cancellationModal.isOpen} onClose={() => setCancellationModal(prev => ({
        ...prev,
        isOpen: false
      }))} classId={cancellationModal.classId} className={cancellationModal.className} classDate={cancellationModal.classDate} onCancellationComplete={loadClasses} />

        {/* Class Report Modal */}
        <ClassReportModal isOpen={reportModal.isOpen} onOpenChange={open => setReportModal({
        isOpen: open,
        classData: open ? reportModal.classData : null
      })} classData={reportModal.classData} onReportCreated={loadClasses} />
      </div>
    </Layout>;
}
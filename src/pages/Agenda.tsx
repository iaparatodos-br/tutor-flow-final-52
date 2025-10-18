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
    virtualClassData?: {
      teacher_id: string;
      class_date: string;
      service_id: string | null;
      is_group_class: boolean;
      service_price: number | null;
      class_template_id: string;
      duration_minutes: number;
    };
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
    // OTIMIZAÇÃO: Limitar geração a 3 meses além da janela visível para performance
    const maxEndDate = new Date(endDate);
    maxEndDate.setMonth(maxEndDate.getMonth() + 3);
    
    // Determinar data final: menor entre recurrence_end_date, maxEndDate
    const recurrenceEndDate = templateClass.recurrence_end_date
      ? new Date(Math.min(
          new Date(templateClass.recurrence_end_date).getTime(),
          maxEndDate.getTime()
        ))
      : maxEndDate;
    
    const pattern = templateClass.recurrence_pattern;
    const effectiveEndDate = recurrenceEndDate;
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

    // Incluir a data do template nas instâncias virtuais
    return occurrences.map(date => ({
      ...templateClass,
      id: `${templateClass.id}_virtual_${date.getTime()}`,
      class_date: date.toISOString(),
      isVirtual: true,
      is_template: false,
      class_template_id: templateClass.id,
      status: 'confirmada' as const,
      participants: templateClass.participants || [] // Garantir array vazio se undefined
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

        // Buscar participantes do template antes de gerar instâncias virtuais
        const templateWithParticipants = template.is_group_class 
          ? await (async () => {
              const { data: participantsData } = await supabase
                .from('class_participants')
                .select(`
                  student_id,
                  profiles!class_participants_student_id_fkey (
                    id, name, email
                  )
                `)
                .eq('class_id', template.id);
              
              const participants = (participantsData || []).map((p: any) => ({
                student_id: p.student_id,
                student: p.profiles
              }));
              
              return { ...template, participants };
            })()
          : await (async () => {
              // AULAS INDIVIDUAIS: buscar o aluno pelo student_id
              if (!template.student_id) {
                return { ...template, participants: [] };
              }
              
              const { data: studentData } = await supabase
                .from('profiles')
                .select('id, name, email')
                .eq('id', template.student_id)
                .maybeSingle();
              
              const participants = studentData ? [{
                student_id: studentData.id,
                student: studentData
              }] : [];
              
              return { ...template, participants };
            })();

        const virtualInstances = generateVirtualInstances(templateWithParticipants, startDate, endDate);
          
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
        class_template_id: templateId
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

      // VALIDAÇÃO 1: Data no passado
      const now = new Date();
      if (classDateTime < now) {
        toast({
          title: "❌ Data Inválida",
          description: "Não é possível agendar aulas no passado.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      // VALIDAÇÃO 2: Conflito de horário (warning, não bloqueio)
      const classEndTime = new Date(classDateTime.getTime() + formData.duration_minutes * 60000);
      const hasConflict = classes?.some(existingClass => {
        if (existingClass.isVirtual || existingClass.is_template) return false;
        
        const existingStart = new Date(existingClass.class_date);
        const existingEnd = new Date(existingStart.getTime() + existingClass.duration_minutes * 60000);
        
        return (
          (classDateTime >= existingStart && classDateTime < existingEnd) ||
          (classEndTime > existingStart && classEndTime <= existingEnd) ||
          (classDateTime <= existingStart && classEndTime >= existingEnd)
        );
      });

      // Conflict detected but allowing scheduling
      // Teacher will receive a warning in the UI

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

      // ROLLBACK: Insert participants with error handling
      if (formData.selectedStudents.length > 0) {
        try {
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
              throw participantError;
            }
          }
        } catch (participantError: any) {
          console.error('Error inserting participants, rolling back classes:', participantError);
          
          // ROLLBACK: Delete created classes
          const classIds = insertedClasses.map(c => c.id);
          await supabase.from('classes').delete().in('id', classIds);
          
          throw new Error('Erro ao adicionar participantes. As aulas não foram criadas.');
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
    // Virtual classes are materialized automatically when edited
    // through other actions (complete, report, cancel)
  };

  const handleRecurringClassCancel = (classId: string, className: string, classDate: string) => {
    const classToCancel = calendarClasses.find(c => c.id === classId);
    
    if (!classToCancel) {
      toast({
        title: "Erro",
        description: "Aula não encontrada",
        variant: "destructive"
      });
      return;
    }
    
    // Find the full class data from classes array to get service info
    const fullClassData = classes.find(c => c.id === classId);
    
    // Prepare virtual class data if it's a virtual class
    const virtualData = classToCancel.isVirtual && fullClassData ? {
      teacher_id: fullClassData.teacher_id || profile!.id,
      class_date: fullClassData.class_date,
      service_id: fullClassData.service_id || null,
      is_group_class: fullClassData.is_group_class || false,
      service_price: null, // Will be fetched from service if needed
      class_template_id: fullClassData.class_template_id || '',
      duration_minutes: fullClassData.duration_minutes || 60
    } : undefined;
    
    setCancellationModal({
      isOpen: true,
      classId,
      className,
      classDate,
      virtualClassData: virtualData
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
        {isAluno && !teacherContextLoading && selectedTeacherId && (
          <StudentScheduleRequest teacherId={selectedTeacherId} />
        )}
        
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
        <CancellationModal 
          isOpen={cancellationModal.isOpen} 
          onClose={() => setCancellationModal(prev => ({
            ...prev,
            isOpen: false
          }))} 
          classId={cancellationModal.classId} 
          className={cancellationModal.className} 
          classDate={cancellationModal.classDate} 
          virtualClassData={cancellationModal.virtualClassData}
          onCancellationComplete={loadClasses} 
        />

        {/* Class Report Modal */}
        <ClassReportModal isOpen={reportModal.isOpen} onOpenChange={open => setReportModal({
        isOpen: open,
        classData: open ? reportModal.classData : null
      })} classData={reportModal.classData} onReportCreated={loadClasses} />
      </div>
    </Layout>;
}
import { useEffect, useState } from "react";
import { useDebouncedCallback } from 'use-debounce';
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
  has_report?: boolean;
  
  recurrence_pattern?: any;
  // student_id REMOVED - use participants array instead
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
      // student_id REMOVED
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
  
  // ✅ OTIMIZAÇÃO FASE 4.1: Debounce para navegação de meses (300ms delay)
  const debouncedLoadClasses = useDebouncedCallback(
    (start: Date, end: Date) => {
      loadClasses(start, end);
    },
    300
  );

  // Cleanup: Cancelar debounce ao desmontar
  useEffect(() => {
    return () => {
      debouncedLoadClasses.cancel();
    };
  }, [debouncedLoadClasses]);
  
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

  // Load classes when visible range changes (with debounce)
  useEffect(() => {
    if (visibleRange && profile) {
      debouncedLoadClasses(visibleRange.start, visibleRange.end);
    }
  }, [visibleRange, profile, debouncedLoadClasses]);
  const handleVisibleRangeChange = (start: Date, end: Date) => {
    setVisibleRange({
      start,
      end
    });
  };

  // Helper function to generate virtual recurring instances for visible range
  const generateVirtualInstances = (templateClass: ClassWithParticipants, startDate: Date, endDate: Date): ClassWithParticipants[] => {
    // ✅ OTIMIZAÇÃO FASE 3.1: Reduzir buffer de +3 meses para +7 dias
    const maxEndDate = new Date(endDate);
    maxEndDate.setDate(maxEndDate.getDate() + 7); // Buffer de +7 dias garante navegação suave
    
    // Determinar data final: menor entre recurrence_end_date, maxEndDate
    let recurrenceEndDate = templateClass.recurrence_end_date
      ? new Date(Math.min(
          new Date(templateClass.recurrence_end_date).getTime(),
          maxEndDate.getTime()
        ))
      : maxEndDate;
    
    // Ajustar para o final do dia para garantir que a última aula na data limite seja incluída
    if (templateClass.recurrence_end_date) {
      recurrenceEndDate = new Date(recurrenceEndDate);
      recurrenceEndDate.setHours(23, 59, 59, 999);
    }
    
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
    const instances = occurrences.map(date => ({
      ...templateClass,
      id: `${templateClass.id}_virtual_${date.getTime()}`,
      class_date: date.toISOString(),
      isVirtual: true,
      is_template: false,
      class_template_id: templateClass.id,
      status: 'confirmada' as const,
      participants: templateClass.participants || [], // Garantir array vazio se undefined
      recurrence_end_date: templateClass.recurrence_end_date,
      has_report: false // Virtual instances never have reports
    }));
    
    return instances;
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

      // Use optimized RPC to get classes with participants in single query
      let data;
      let error;
      if (isProfessor) {
        ({
          data,
          error
        } = await supabase.rpc('get_classes_with_participants', {
          p_teacher_id: profile.id,
          p_start_date: startDate.toISOString(),
          p_end_date: endDate.toISOString()
        }));
        
        // Add has_report information
        if (data) {
          const classIds = data.map(c => c.id);
          const { data: reportsData } = await supabase
            .from('class_reports')
            .select('class_id')
            .in('class_id', classIds);
          
          const classesWithReports = new Set(reportsData?.map(r => r.class_id) || []);
          data = data.map(c => ({
            ...c,
            has_report: classesWithReports.has(c.id)
          }));
        }
      } else {
        // For students, get classes where they are active participants (via class_participants)
        let individualQuery = supabase
          .from('classes')
          .select(`
            id,
            class_date,
            duration_minutes,
            status,
            notes,
            is_experimental,
            is_group_class,
            service_id,
            teacher_id,
            recurrence_pattern,
            is_template,
            recurrence_end_date,
            class_template_id,
            class_participants!inner (
              student_id,
              status,
              cancelled_at,
              charge_applied,
              confirmed_at,
              completed_at,
              cancellation_reason,
              profiles!class_participants_student_id_fkey (
                name,
                email
              )
            )
          `)
          .eq('class_participants.student_id', profile.id)
          .eq('is_group_class', false)
          .gte('class_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('class_date');

        if (selectedTeacherId) {
          individualQuery = individualQuery.eq('teacher_id', selectedTeacherId);
        }

        const { data: individualClasses, error: individualError } = await individualQuery;

        if (individualError) {
          console.error('Error loading individual classes:', individualError);
          throw individualError;
        }

        // Query 2: Aulas em grupo onde o aluno é participante
        let groupQuery = supabase
          .from('classes')
          .select(`
            id,
            class_date,
            duration_minutes,
            status,
            notes,
            is_experimental,
            is_group_class,
            service_id,
            teacher_id,
            recurrence_pattern,
            is_template,
            recurrence_end_date,
            class_template_id,
          class_participants!inner (
            student_id,
            status,
            cancelled_at,
            charge_applied,
            confirmed_at,
            completed_at,
            cancellation_reason,
            profiles!class_participants_student_id_fkey (
              name,
              email
            )
          )
          `)
          .eq('class_participants.student_id', profile.id)
          .eq('is_group_class', true)
          .gte('class_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('class_date');

        if (selectedTeacherId) {
          groupQuery = groupQuery.eq('teacher_id', selectedTeacherId);
        }

        const { data: groupClasses, error: groupError } = await groupQuery;

        if (groupError) {
          console.error('Error loading group classes:', groupError);
          throw groupError;
        }

        // Consolidar resultados e remover duplicatas
        const allClasses = [...(individualClasses || []), ...(groupClasses || [])];
        const uniqueClassesMap = new Map(allClasses.map(c => [c.id, c]));
        const studentData = Array.from(uniqueClassesMap.values());
        
        // Add has_report information for students
        if (studentData) {
          const classIds = studentData.map(c => c.id);
          const { data: reportsData } = await supabase
            .from('class_reports')
            .select('class_id')
            .in('class_id', classIds);
          
          const classesWithReports = new Set(reportsData?.map(r => r.class_id) || []);
          
          data = studentData.map(c => ({
            ...c,
            has_report: classesWithReports.has(c.id)
          }));
        } else {
          data = studentData || [];
        }
        error = null;

        // Para alunos, buscar TODOS os participantes das aulas em grupo (não apenas o aluno logado)
        const groupClassIds = data
          .filter((cls: any) => cls.is_group_class)
          .map((cls: any) => cls.id);

        if (groupClassIds.length > 0) {
          // Buscar participantes de aulas em grupo (sem perfis)
          const { data: allParticipants, error: participantsError } = await supabase
            .from('class_participants')
            .select('class_id, student_id, status, cancelled_at, charge_applied, confirmed_at, completed_at, cancellation_reason')
            .in('class_id', groupClassIds);

          if (participantsError) {
            console.error('Erro ao buscar participantes:', participantsError);
          }

          // Extrair student_ids únicos
          const uniqueStudentIds = [...new Set(allParticipants?.map(p => p.student_id) || [])];

          // Buscar perfis separadamente usando VIEW segura (protege dados sensíveis)
          const { data: profilesData, error: profilesError } = await supabase
            .from('safe_classmate_profiles')
            .select('id, name, email')
            .in('id', uniqueStudentIds);

          if (profilesError) {
            console.error('Erro ao buscar perfis:', profilesError);
          }

          // Criar mapa de perfis
          const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

          // Combinar participantes com perfis
          const participantsWithProfiles = allParticipants?.map(p => ({
            ...p,
            profiles: profilesMap.get(p.student_id) || null
          }));

          if (!participantsError && participantsWithProfiles) {
            // Criar um mapa de class_id -> participantes
            const participantsMap = new Map<string, any[]>();
            participantsWithProfiles.forEach((p: any) => {
              if (!participantsMap.has(p.class_id)) {
                participantsMap.set(p.class_id, []);
              }
              participantsMap.get(p.class_id)!.push({
                student_id: p.student_id,
                status: p.status,
                cancelled_at: p.cancelled_at,
                charge_applied: p.charge_applied,
                confirmed_at: p.confirmed_at,
                completed_at: p.completed_at,
                cancellation_reason: p.cancellation_reason,
                profiles: p.profiles
              });
            });

            // Atualizar as aulas em grupo com TODOS os participantes
            data = data.map((cls: any) => {
              if (cls.is_group_class && participantsMap.has(cls.id)) {
                return {
                  ...cls,
                  class_participants: participantsMap.get(cls.id)
                };
              }
              return cls;
            });
          }
        }

        // Buscar todos os participantes dos templates para alunos
        if (!isProfessor && data && data.length > 0) {
          const templateIds = data
            .filter((cls: any) => cls.is_template === true)
            .map((cls: any) => cls.id);

          if (templateIds.length > 0) {
            // Buscar TODOS os participantes desses templates (sem filtro de student_id)
            const { data: allTemplateParticipants } = await supabase
              .from('class_participants')
              .select('class_id, student_id, status, cancelled_at, charge_applied, confirmed_at, completed_at, cancellation_reason')
              .in('class_id', templateIds);

            // Extrair student_ids únicos
            const uniqueStudentIds = [...new Set(allTemplateParticipants?.map(p => p.student_id) || [])];

            // Buscar perfis separadamente usando VIEW segura (protege dados sensíveis)
            const { data: profilesData } = await supabase
              .from('safe_classmate_profiles')
              .select('id, name, email')
              .in('id', uniqueStudentIds);

            // Criar mapa de perfis
            const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

            // Combinar participantes com perfis
            const participantsWithProfiles = allTemplateParticipants?.map(p => ({
              ...p,
              profiles: profilesMap.get(p.student_id) || null
            }));

            // Criar mapa class_id -> participantes completos
            const templateParticipantsMap = new Map<string, any[]>();
            participantsWithProfiles?.forEach((p: any) => {
              if (!templateParticipantsMap.has(p.class_id)) {
                templateParticipantsMap.set(p.class_id, []);
              }
              templateParticipantsMap.get(p.class_id)!.push({
                student_id: p.student_id,
                status: p.status,
                cancelled_at: p.cancelled_at,
                charge_applied: p.charge_applied,
                confirmed_at: p.confirmed_at,
                completed_at: p.completed_at,
                cancellation_reason: p.cancellation_reason,
                profiles: p.profiles
              });
            });

            // Enriquecer templates com participantes completos
            data = data.map((cls: any) => {
              if (cls.is_template && templateParticipantsMap.has(cls.id)) {
                return {
                  ...cls,
                  class_participants: templateParticipantsMap.get(cls.id)
                };
              }
              return cls;
            });
          }
        }
      }
      if (error) {
        console.error('Error loading classes:', error);
        throw error;
      }

      // Separar templates de aulas materializadas
      const templates = (data || []).filter((c: any) => c.is_template === true);
      const materializedClasses = (data || []).filter((c: any) => c.is_template !== true);

      // Process participants data from RPC response
      let classesWithDetails;
      if (isProfessor) {
        // RPC already returns participants as JSONB array, just parse it
        classesWithDetails = materializedClasses.map((cls: any) => {
          const participants = Array.isArray(cls.participants) 
            ? cls.participants.map((p: any) => ({
                student_id: p.student_id,
                status: p.status,
                cancelled_at: p.cancelled_at,
                cancelled_by: p.cancelled_by,
                charge_applied: p.charge_applied,
                confirmed_at: p.confirmed_at,
                completed_at: p.completed_at,
                cancellation_reason: p.cancellation_reason,
                student: p.profiles
              }))
            : [];
          return {
            ...cls,
            participants
          };
        });
      } else {
        // For students, data already comes with relations
        classesWithDetails = materializedClasses.map((item: any) => {
          // For students: Get participants from class_participants (no legacy fallback)
          const participants = item.class_participants?.map((p: any) => ({
            student_id: p.student_id,
            status: p.status,
            cancelled_at: p.cancelled_at,
            cancelled_by: p.cancelled_by,
            charge_applied: p.charge_applied,
            confirmed_at: p.confirmed_at,
            completed_at: p.completed_at,
            cancellation_reason: p.cancellation_reason,
            student: p.profiles
          })) || [];
          
          return {
            ...item,
            participants
          };
        });
      }

      // Enriquecer aulas materializadas com recurrence_end_date do template
      const materializedWithTemplateIds = classesWithDetails.filter((cls: any) => 
        cls.class_template_id && !cls.recurrence_end_date
      );

      if (materializedWithTemplateIds.length > 0) {
        const templateIds = [...new Set(materializedWithTemplateIds.map((cls: any) => cls.class_template_id))] as string[];
        const { data: templatesData } = await supabase
          .from('classes')
          .select('id, recurrence_end_date')
          .in('id', templateIds)
          .eq('is_template', true);
        
        const templateEndDates = new Map(
          (templatesData || []).map(t => [t.id, t.recurrence_end_date])
        );
        
        classesWithDetails = classesWithDetails.map((cls: any) => {
          if (cls.class_template_id && !cls.recurrence_end_date) {
            const endDate = templateEndDates.get(cls.class_template_id);
            
            return {
              ...cls,
              recurrence_end_date: endDate || null
            };
          }
          return cls;
        });
      }

      // Generate virtual instances for infinite recurrences from TEMPLATES
      const allClasses: ClassWithParticipants[] = [...classesWithDetails];
      
      // Process each template to generate virtual instances
      for (const template of templates) {
        // Check if recurrence is still active
        if (template.recurrence_end_date) {
          const templateEndDate = new Date(template.recurrence_end_date);
          if (templateEndDate < startDate) {
            continue; // Template already ended
          }
        }

        // ✅ OTIMIZAÇÃO FASE 1.1: Participantes já vêm do RPC (professor) ou class_participants (aluno)
        const participantsFormatted = isProfessor
          ? (Array.isArray(template.participants)
              ? template.participants.map((p: any) => ({
                  student_id: p.student_id,
                  student: p.profiles
                }))
              : [])
          : (Array.isArray(template.class_participants)
              ? template.class_participants.map((p: any) => ({
                  student_id: p.student_id,
                  student: p.profiles
                }))
              : []);
        
        const templateWithParticipants = {
          ...template,
          participants: participantsFormatted
        };

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
      setClasses(allClasses);

      // Build a per-student participation map to ensure correct status rendering for students
      let myParticipationByClassId: Map<string, { status: string | null; cancelled_at: string | null }> = new Map();
      if (!isProfessor) {
        const classIds = allClasses.filter(c => !c.isVirtual).map(c => c.id);
        if (classIds.length > 0) {
          const { data: myParts } = await supabase
            .from('class_participants')
            .select('class_id, status, cancelled_at')
            .eq('student_id', profile.id)
            .in('class_id', classIds);

          (myParts || []).forEach((row: any) => {
            myParticipationByClassId.set(row.class_id, { status: row.status, cancelled_at: row.cancelled_at });
          });
        }
      }

      // Transform for calendar view
      const calendarEvents: CalendarClass[] = allClasses
        .filter(cls => !cls.is_template) // Não mostrar templates na agenda
        .filter(cls => {
          // For students, show only classes with active participation
          if (!isProfessor) {
            const myStatus = myParticipationByClassId.get(cls.id)?.status;
            if (myStatus) {
              return ['pendente', 'confirmada', 'concluida', 'cancelada'].includes(myStatus);
            }
            if (cls.participants.length > 0) {
              const myParticipation = cls.participants.find(p => p.student_id === profile.id);
              return myParticipation && ['pendente', 'confirmada', 'concluida', 'cancelada'].includes(myParticipation.status || cls.status);
            }
          }
          return true;
        })
        .map(cls => {
          const calendarStartDate = new Date(cls.class_date);
          const calendarEndDate = new Date(calendarStartDate.getTime() + cls.duration_minutes * 60 * 1000);
          const participantNames = cls.participants.map(p => p.student?.name || 'Nome não disponível').join(', ');
          const titleSuffix = cls.is_experimental ? ' (Experimental)' : '';
          const groupIndicator = cls.is_group_class ? ` [${cls.participants.length} alunos]` : '';
          const virtualSuffix = cls.isVirtual ? ' (Recorrente)' : '';

          // Determine display status for students
          let displayStatus = cls.status;
          if (!isProfessor) {
            const myStatus = myParticipationByClassId.get(cls.id)?.status;
            if (myStatus) {
              displayStatus = myStatus as any;
            } else if (cls.participants.length > 0) {
              const myParticipation = cls.participants.find(p => p.student_id === profile.id);
              displayStatus = (myParticipation?.status as any) || cls.status;
            }
          }

          return {
            id: cls.id,
            title: `${participantNames}${groupIndicator} - ${cls.duration_minutes}min${titleSuffix}${virtualSuffix}`,
            start: calendarStartDate,
            end: calendarEndDate,
            status: displayStatus,
            // student_id REMOVED - use participants array
            student: cls.participants[0]?.student || {
              name: 'Sem aluno',
              email: ''
            },
            participants: cls.participants,
            notes: cls.notes || undefined,
            is_experimental: cls.is_experimental,
            is_group_class: cls.is_group_class,
            isVirtual: cls.isVirtual,
            class_template_id: cls.class_template_id,
            recurrence_end_date: cls.recurrence_end_date,
            has_report: !!cls.has_report
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
      // Atualizar status da aula
      const { error } = await supabase
        .from('classes')
        .update({ status: 'confirmada' })
        .eq('id', classId);

      if (error) throw error;

      // Atualizar status dos participantes (exceto cancelados)
      const { error: participantsError } = await supabase
        .from('class_participants')
        .update({ 
          status: 'confirmada',
          confirmed_at: new Date().toISOString()
        })
        .eq('class_id', classId)
        .neq('status', 'cancelada'); // Preservar cancelamentos individuais

      if (participantsError) {
        console.error('Erro ao atualizar participantes:', participantsError);
        throw participantsError;
      }
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
  const materializeVirtualClass = async (virtualId: string, targetStatus: 'confirmada' | 'concluida' = 'confirmada', silent: boolean = false): Promise<string> => {
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
        // student_id REMOVED - use class_participants instead
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
      } else if (!virtualClass.is_group_class && virtualClass.participants?.length === 1) {
        // Create participant for individual class
        const { error: participantError } = await supabase
          .from('class_participants')
          .insert({
            class_id: newClass.id,
            student_id: virtualClass.participants[0].student_id,
            status: targetStatus,
            confirmed_at: targetStatus === 'confirmada' || targetStatus === 'concluida' ? new Date().toISOString() : null,
            completed_at: targetStatus === 'concluida' ? new Date().toISOString() : null
          });
        
        if (participantError) {
          console.error('Error creating participant for materialized individual class:', participantError);
          throw participantError;
        }
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

      if (!silent) {
        toast(statusMessages[targetStatus]);
      }

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
    
    // Subtrair 1 porque a primeira ocorrência é a própria startDate
    if (frequency === 'weekly') {
      endDate.setDate(endDate.getDate() + ((occurrences - 1) * 7));
    } else if (frequency === 'biweekly') {
      endDate.setDate(endDate.getDate() + ((occurrences - 1) * 14));
    } else if (frequency === 'monthly') {
      endDate.setMonth(endDate.getMonth() + (occurrences - 1));
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
            // Ajustar para o final do dia para incluir todas as aulas na data limite
            const endDate = new Date(formData.recurrence.end_date);
            endDate.setHours(23, 59, 59, 999);
            recurrenceEndDate = endDate.toISOString();
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
      // Note: Individual classes without selectedStudents are now handled 
      // by the selectedStudents array above (no separate logic needed)
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

      // Atualizar status dos participantes (exceto os que estão cancelados)
      const { error: participantsError } = await supabase
        .from('class_participants')
        .update({ 
          status: 'concluida',
          completed_at: new Date().toISOString()
        })
        .eq('class_id', classId)
        .neq('status', 'cancelada');
      
      if (participantsError) {
        console.error('Erro ao atualizar participantes:', participantsError);
        // Não lançar erro aqui para não bloquear o fluxo principal
      }

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
    // Simplesmente abrir o modal, SEM materializar a aula virtual
    setReportModal({ 
      isOpen: true, 
      classData: classData // Passar a aula como está (virtual ou não)
    });
  };

  const handleReportCreated = async () => {
    // ClassReportModal já materializou a aula virtual se necessário
    // Apenas recarregar classes para refletir has_report = true
    
    if (visibleRange) {
      await loadClasses(visibleRange.start, visibleRange.end);
    }
    
    setReportModal({ isOpen: false, classData: null });
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
      // student_id REMOVED - no longer needed
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
          currentUserId={profile?.id}
          onConfirmClass={handleConfirmClass} 
          onCancelClass={handleRecurringClassCancel} 
          onCompleteClass={(classData: CalendarClass) => handleCompleteClass(classData.id)} 
          onEditReport={handleManageReport}
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
      })} classData={reportModal.classData} onReportCreated={handleReportCreated} />
      </div>
    </Layout>;
}
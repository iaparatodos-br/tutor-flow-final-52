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

interface ClassWithParticipants {
  id: string;
  class_date: string;
  duration_minutes: number;
  status: 'pendente' | 'confirmada' | 'cancelada' | 'concluida';
  notes: string | null;
  is_experimental: boolean;
  is_group_class: boolean;
  parent_class_id?: string;
  recurrence_pattern?: any;
  student_id?: string;
  service_id?: string;
  teacher_id?: string;
  isVirtual?: boolean; // Flag for client-side generated instances
  participants: Array<{
    student_id: string;
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
  const { profile, isProfessor, isAluno } = useProfile();
  const { loading: authLoading } = useAuth();
  const { hasFeature } = useSubscription();
  const { toast } = useToast();
  
  const [classes, setClasses] = useState<ClassWithParticipants[]>([]);
  const [calendarClasses, setCalendarClasses] = useState<CalendarClass[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [services, setServices] = useState<ClassService[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellationModal, setCancellationModal] = useState<{
    isOpen: boolean;
    classId: string;
    className: string;
    classDate: string;
  }>({ isOpen: false, classId: "", className: "", classDate: "" });
  
  const [reportModal, setReportModal] = useState<{
    isOpen: boolean;
    classData: CalendarClass | null;
  }>({ isOpen: false, classData: null });

  useEffect(() => {
    if (!authLoading && profile) {
      loadClasses();
      if (isProfessor) {
        loadStudents();
        loadAvailabilityBlocks();
        loadServices();
      }
    }
  }, [profile, isProfessor, authLoading]);

  // Helper function to generate virtual recurring instances
  const generateVirtualInstances = (templateClass: ClassWithParticipants, endDate: Date): ClassWithParticipants[] => {
    if (!templateClass.recurrence_pattern?.is_infinite) return [];
    
    const pattern = templateClass.recurrence_pattern;
    const freq = pattern.frequency === 'weekly' ? Frequency.WEEKLY :
                pattern.frequency === 'biweekly' ? Frequency.WEEKLY :
                pattern.frequency === 'monthly' ? Frequency.MONTHLY : Frequency.WEEKLY;
    
    const interval = pattern.frequency === 'biweekly' ? 2 : 1;
    
    const rule = new RRule({
      freq,
      interval,
      dtstart: new Date(templateClass.class_date),
      until: endDate
    });
    
    const occurrences = rule.all();
    
    return occurrences.slice(1).map((date) => ({
      ...templateClass,
      id: `${templateClass.id}_virtual_${date.getTime()}`,
      class_date: date.toISOString(),
      isVirtual: true,
      status: 'pendente' as const
    }));
  };

  const loadClasses = async () => {
    if (!profile?.id) return;

    try {
      // Get viewing period (3 months ahead for dynamic generation)
      const now = new Date();
      const viewEnd = new Date(now);
      viewEnd.setMonth(viewEnd.getMonth() + 3);
      
      // Use RPC to get optimized data for professors
      let data;
      let error;
      
      if (isProfessor) {
        ({ data, error } = await supabase.rpc('get_calendar_events', {
          p_teacher_id: profile.id,
          p_start_date: now.toISOString(),
          p_end_date: viewEnd.toISOString()
        }));
      } else {
        // For students, get classes normally
        ({ data, error } = await supabase
          .from('classes')
          .select(`
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
            parent_class_id,
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
          `)
          .eq('student_id', profile.id)
          .gte('class_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('class_date'));
      }

      if (error) {
        console.error('Error loading classes:', error);
        throw error;
      }

      // Fetch related data for each class (only for RPC results)
      let classesWithDetails;
      if (isProfessor) {
        classesWithDetails = await Promise.all((data || []).map(async (cls: any) => {
          const [studentsData, participantsData] = await Promise.all([
            // Get student data for individual classes
            cls.student_id ? supabase
              .from('profiles')
              .select('id, name, email')
              .eq('id', cls.student_id)
              .single() : Promise.resolve({ data: null }),
            
            // Get participants for group classes
            cls.is_group_class ? supabase
              .from('class_participants')
              .select(`
                student_id,
                profiles!class_participants_student_id_fkey (
                  id, name, email
                )
              `)
              .eq('class_id', cls.id) : Promise.resolve({ data: [] })
          ]);

          const participants = cls.is_group_class 
            ? (participantsData.data || []).map((p: any) => ({
                student_id: p.student_id,
                student: p.profiles
              }))
            : studentsData.data 
              ? [{ student_id: studentsData.data.id, student: studentsData.data }]
              : [];

          return {
            ...cls,
            participants
          };
        }));
      } else {
        // For students, data already comes with relations
        classesWithDetails = (data || []).map((item: any) => {
          const participants = item.is_group_class 
            ? item.class_participants.map((p: any) => ({
                student_id: p.student_id,
                student: p.profiles
              }))
            : item.student_id && item.profiles
              ? [{
                  student_id: item.student_id,
                  student: item.profiles
                }]
              : [];

          return {
            ...item,
            participants
          };
        });
      }

      // Generate virtual instances for infinite recurrences (only for professors)
      const allClasses: ClassWithParticipants[] = [...classesWithDetails];
      
      if (isProfessor) {
        for (const cls of classesWithDetails) {
          if (cls.recurrence_pattern?.is_infinite && !cls.parent_class_id) {
            // This is a template class for infinite recurrence
            const virtualInstances = generateVirtualInstances(cls, viewEnd);
            
            // Filter out virtual instances that conflict with real classes
            const realClassDates = new Set(
              classesWithDetails
                .filter(c => c.parent_class_id === cls.id)
                .map(c => new Date(c.class_date).toDateString())
            );
            
            const filteredVirtual = virtualInstances.filter(virtual => 
              !realClassDates.has(new Date(virtual.class_date).toDateString())
            );
            
            allClasses.push(...filteredVirtual);
          }
        }
      }
      
      setClasses(allClasses);

      // Transform for calendar view
      const calendarEvents: CalendarClass[] = allClasses.map(cls => {
        const startDate = new Date(cls.class_date);
        const endDate = new Date(startDate.getTime() + (cls.duration_minutes * 60 * 1000));
        
        const participantNames = cls.participants.map(p => p.student.name).join(', ');
        const titleSuffix = cls.is_experimental ? ' (Experimental)' : '';
        const groupIndicator = cls.is_group_class ? ` [${cls.participants.length} alunos]` : '';
        const virtualSuffix = cls.isVirtual ? ' (Recorrente)' : '';
        
        return {
          id: cls.id,
          title: `${participantNames}${groupIndicator} - ${cls.duration_minutes}min${titleSuffix}${virtualSuffix}`,
          start: startDate,
          end: endDate,
          status: cls.status,
          student: cls.participants[0]?.student || { name: 'Sem aluno', email: '' },
          participants: cls.participants,
          notes: cls.notes || undefined,
          is_experimental: cls.is_experimental,
          is_group_class: cls.is_group_class,
          isVirtual: cls.isVirtual
        };
      });
      
      setCalendarClasses(calendarEvents);
    } catch (error) {
      console.error('Erro ao carregar aulas:', error);
      toast({
        title: "Erro ao carregar agenda",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAvailabilityBlocks = async () => {
    if (!profile?.id || !isProfessor) return;
    
    try {
      const { data, error } = await supabase
        .from('availability_blocks')
        .select('*')
        .eq('teacher_id', profile.id)
        .gte('end_datetime', new Date().toISOString())
        .order('start_datetime');

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
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('teacher_id', profile.id)
        .eq('role', 'aluno');

      if (error) {
        console.error('Erro ao carregar alunos:', error);
        return;
      }

      setStudents(data || []);
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
    }
  };

  const loadServices = async () => {
    if (!profile?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('class_services')
        .select('id, name, price, duration_minutes')
        .eq('teacher_id', profile.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');

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

      const { error } = await supabase
        .from('classes')
        .update({ status: 'confirmada' })
        .eq('id', classId);

      if (error) throw error;

      toast({
        title: "Aula confirmada!",
        description: "A aula foi confirmada com sucesso",
      });
      
      loadClasses();
    } catch (error: any) {
      console.error('Erro ao confirmar aula:', error);
      toast({
        title: "Erro ao confirmar aula",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  const materializeVirtualClass = async (virtualId: string) => {
    try {
      // Find the virtual class in our current state
      const virtualClass = classes.find(cls => cls.id === virtualId);
      if (!virtualClass || !virtualClass.isVirtual) {
        throw new Error('Virtual class not found');
      }

      // Find the template class (parent)
      const templateId = virtualId.split('_virtual_')[0];
      const templateClass = classes.find(cls => cls.id === templateId);
      if (!templateClass) {
        throw new Error('Template class not found');
      }

      // Create real class from virtual instance
      const realClassData = {
        teacher_id: profile?.id,
        student_id: templateClass.student_id,
        service_id: templateClass.service_id,
        class_date: virtualClass.class_date,
        duration_minutes: virtualClass.duration_minutes,
        notes: virtualClass.notes,
        status: 'confirmada',
        is_experimental: virtualClass.is_experimental,
        is_group_class: virtualClass.is_group_class,
        parent_class_id: templateId
      };

      const { data: newClass, error } = await supabase
        .from('classes')
        .insert([realClassData])
        .select()
        .single();

      if (error) throw error;

      // Insert participants if it's a group class
      if (virtualClass.is_group_class && virtualClass.participants.length > 0) {
        const participantInserts = virtualClass.participants.map(p => ({
          class_id: newClass.id,
          student_id: p.student_id
        }));

        const { error: participantError } = await supabase
          .from('class_participants')
          .insert(participantInserts);

        if (participantError) throw participantError;
      }

      toast({
        title: "Aula confirmada!",
        description: "A aula recorrente foi confirmada e agendada",
      });

      loadClasses();
    } catch (error: any) {
      console.error('Erro ao materializar aula virtual:', error);
      toast({
        title: "Erro ao confirmar aula",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
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
        class_date: currentDate.toISOString()
      });
    }

    return classes;
  };

  const handleClassSubmit = async (formData: any) => {
    if (!profile?.id) return;

    setSubmitting(true);
    
    try {
      const classDateTime = new Date(`${formData.class_date}T${formData.time}`);
      
      // Check if professor has access to financial module
      const hasFinancialAccess = hasFeature('financial_module');
      
      // If no financial access, mark class as experimental to prevent billing
      const shouldMarkExperimental = !hasFinancialAccess || formData.is_experimental;
      
      if (!hasFinancialAccess && !formData.is_experimental) {
        console.log('Professor without financial module - marking class as experimental to prevent billing');
      }
      
      // Create base class data
      const baseClassData = {
        teacher_id: profile.id,
        student_id: formData.is_group_class ? null : formData.selectedStudents[0] || null,
        service_id: formData.service_id || null,
        class_date: classDateTime.toISOString(),
        duration_minutes: formData.duration_minutes,
        notes: formData.notes || null,
        status: 'pendente',
        is_experimental: shouldMarkExperimental,
        is_group_class: formData.is_group_class,
        recurrence_pattern: formData.recurrence ? formData.recurrence : null
      };

      let insertedClasses;
      
      if (formData.recurrence) {
        if (formData.recurrence.is_infinite) {
          // For infinite recurrence, only create the template class (anchor event)
          const { data: templateClass, error: templateError } = await supabase
            .from('classes')
            .insert([baseClassData])
            .select()
            .single();

          if (templateError) throw templateError;

          insertedClasses = [templateClass];
        } else {
          // Regular finite recurrence - still create all instances
          const classesToCreate = generateRecurringClasses(baseClassData, formData.recurrence);
          const { data: classes, error: classError } = await supabase
            .from('classes')
            .insert(classesToCreate)
            .select();

          if (classError) throw classError;
          insertedClasses = classes;
        }
      } else {
        // Single class
        const { data: classes, error: classError } = await supabase
          .from('classes')
          .insert([baseClassData])
          .select();

        if (classError) throw classError;
        insertedClasses = classes;
      }

      // Insert participants for group classes
      if (formData.is_group_class && formData.selectedStudents.length > 0) {
        for (const classInstance of insertedClasses) {
          const participantInserts = formData.selectedStudents.map((studentId: string) => ({
            class_id: classInstance.id,
            student_id: studentId
          }));

          const { error: participantError } = await supabase
            .from('class_participants')
            .insert(participantInserts);

          if (participantError) {
            console.error('Error inserting participants:', participantError);
            throw participantError;
          }
        }
      }

      if (formData.recurrence?.is_infinite) {
        toast({
          title: "Série recorrente criada!",
          description: "A aula se repetirá automaticamente conforme a programação",
        });
      } else if (insertedClasses.length > 1) {
        toast({
          title: "Aulas agendadas!",
          description: `${insertedClasses.length} aulas foram criadas com sucesso`,
        });
      } else {
        toast({
          title: "Aula agendada!",
          description: "A aula foi criada com sucesso",
        });
      }

      loadClasses();
    } catch (error: any) {
      console.error('Erro ao criar aula:', error);
      toast({
        title: "Erro ao agendar aula",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteClass = async (classId: string) => {
    try {
      const { error } = await supabase
        .from('classes')
        .update({ status: 'concluida' })
        .eq('id', classId);

      if (error) throw error;

      toast({
        title: "Aula concluída!",
        description: "A aula foi marcada como concluída",
      });
      
      loadClasses();
    } catch (error: any) {
      console.error('Erro ao concluir aula:', error);
      toast({
        title: "Erro ao concluir aula",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto p-6 space-y-6">
          <Card>
            <CardContent className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p>Carregando agenda...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Agenda</h1>
          {isProfessor && (
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Aula
            </Button>
          )}
        </div>

        {/* Schedule Request Component for Students */}
        {isAluno && <StudentScheduleRequest teacherId={profile?.teacher_id} />}

        <SimpleCalendar 
          classes={calendarClasses}
          availabilityBlocks={availabilityBlocks}
          onConfirmClass={handleConfirmClass}
          onCancelClass={(classId: string, className: string, classDate: string) => 
            setCancellationModal({
              isOpen: true,
              classId,
              className,
              classDate
            })
          }
          onCompleteClass={(classData: CalendarClass) => handleCompleteClass(classData.id)}
          isProfessor={isProfessor}
        />

        {/* Availability Manager for Professors */}
        {isProfessor && <AvailabilityManager />}

        {/* Class Form Dialog */}
        <ClassForm
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onSubmit={handleClassSubmit}
          students={students}
          services={services}
          existingClasses={classes}
        />

        {/* Cancellation Modal */}
        <CancellationModal
          isOpen={cancellationModal.isOpen}
          onClose={() => setCancellationModal(prev => ({ ...prev, isOpen: false }))}
          classId={cancellationModal.classId}
          className={cancellationModal.className}
          classDate={cancellationModal.classDate}
          onCancellationComplete={loadClasses}
        />

        {/* Class Report Modal */}
        <ClassReportModal
          isOpen={reportModal.isOpen}
          onOpenChange={(open) => setReportModal({ isOpen: open, classData: open ? reportModal.classData : null })}
          classData={reportModal.classData}
          onReportCreated={loadClasses}
        />
      </div>
    </Layout>
  );
}
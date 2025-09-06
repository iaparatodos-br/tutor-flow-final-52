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
import { useInfiniteRecurrence } from "@/hooks/useInfiniteRecurrence";

interface ClassWithParticipants {
  id: string;
  class_date: string;
  duration_minutes: number;
  status: 'pendente' | 'confirmada' | 'cancelada' | 'concluida';
  notes: string | null;
  is_experimental: boolean;
  is_group_class: boolean;
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
  const { checkAndGenerateClasses, isGenerating } = useInfiniteRecurrence();
  
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

  const loadClasses = async () => {
    if (!profile?.id) return;

    try {
      // Check for infinite recurring classes and generate more if needed
      if (isProfessor) {
        const now = new Date();
        const futureDate = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000)); // 90 days ahead
        await checkAndGenerateClasses(profile.id, now, futureDate);
      }

      const { data, error } = await supabase
        .from('classes')
        .select(`
          id,
          class_date,
          duration_minutes,
          status,
          notes,
          is_experimental,
          is_group_class,
          class_participants (
            student_id,
            profiles!class_participants_student_id_fkey (
              name,
              email
            )
          )
        `)
        .eq(isProfessor ? 'teacher_id' : 'student_id', profile.id)
        .gte('class_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('class_date');

      if (error) throw error;
      
      const mappedClasses = (data || []).map(item => ({
        ...item,
        participants: item.class_participants.map(p => ({
          student_id: p.student_id,
          student: p.profiles
        }))
      })) as ClassWithParticipants[];
      
      setClasses(mappedClasses);

      // Transform for calendar view
      const calendarEvents: CalendarClass[] = mappedClasses.map(cls => {
        const startDate = new Date(cls.class_date);
        const endDate = new Date(startDate.getTime() + (cls.duration_minutes * 60 * 1000));
        
        const participantNames = cls.participants.map(p => p.student.name).join(', ');
        const titleSuffix = cls.is_experimental ? ' (Experimental)' : '';
        const groupIndicator = cls.is_group_class ? ` [${cls.participants.length} alunos]` : '';
        
        return {
          id: cls.id,
          title: `${participantNames}${groupIndicator} - ${cls.duration_minutes}min${titleSuffix}`,
          start: startDate,
          end: endDate,
          status: cls.status,
          student: cls.participants[0]?.student || { name: 'Sem aluno', email: '' },
          participants: cls.participants,
          notes: cls.notes || undefined,
          is_experimental: cls.is_experimental,
          is_group_class: cls.is_group_class
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

  const generateRecurringClasses = (baseClass: any, recurrence: any) => {
    const classes = [baseClass];
    
    // Normalize frequency to handle undefined values
    const normalizedFrequency = recurrence.frequency || 'weekly';
    
    // For infinite recurrence, only generate initial batch (next 12 weeks)
    if (recurrence.is_infinite) {
      const startDate = new Date(baseClass.class_date);
      let currentDate = new Date(startDate);
      const initialBatchLimit = 12; // Generate 12 weeks ahead initially

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

      for (let i = 1; i < initialBatchLimit; i++) {
        const nextDate = getNextDate(currentDate, normalizedFrequency);
        
        // Safety check: ensure date is advancing
        if (nextDate.getTime() <= currentDate.getTime()) {
          console.error(`Date not advancing for frequency ${normalizedFrequency}. Breaking loop.`);
          break;
        }
        
        currentDate = nextDate;
        classes.push({
          ...baseClass,
          class_date: currentDate.toISOString()
        });
      }

      return classes;
    }

    // Original logic for finite recurrence
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
      
      currentDate = nextDate;
      
      if (endDate && currentDate > endDate) break;

      classes.push({
        ...baseClass,
        class_date: currentDate.toISOString()
      });
    }

    return classes;
  };

  const handleAddClass = async (formData: any) => {
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
          // For infinite recurrence, first insert the template class
          const { data: templateClass, error: templateError } = await supabase
            .from('classes')
            .insert([baseClassData])
            .select()
            .single();

          if (templateError) throw templateError;

          // Generate initial batch of recurring classes
          const recurringClasses = generateRecurringClasses(baseClassData, formData.recurrence)
            .slice(1) // Skip the first one (template)
            .map(cls => ({
              ...cls,
              parent_class_id: templateClass.id,
              recurrence_pattern: null // Only template has the pattern
            }));

          // Before inserting, check for existing classes on the same dates to avoid duplicates
          const newDates = recurringClasses.map(c => c.class_date);
          let toInsert = recurringClasses;

          if (newDates.length > 0) {
            const { data: existing, error: existingError } = await supabase
              .from('classes')
              .select('class_date')
              .eq('parent_class_id', templateClass.id)
              .in('class_date', newDates);

            if (existingError) {
              console.warn('Falha ao verificar duplicidades, prosseguindo sem filtro:', existingError);
            } else {
              const existingSet = new Set((existing || []).map(e => new Date(e.class_date as unknown as string).toISOString()));
              toInsert = recurringClasses.filter(c => !existingSet.has(c.class_date));
            }
          }

          if (toInsert.length > 0) {
            const { data: recurringInserted, error: recurringError } = await supabase
              .from('classes')
              .insert(toInsert)
              .select();

            if (recurringError) throw recurringError;

            insertedClasses = [templateClass, ...(recurringInserted || [])];
          } else {
            insertedClasses = [templateClass];
          }
        } else {
          // Regular finite recurrence
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

      // Insert participants for each class
      const participantInserts = [];
      for (const classData of insertedClasses) {
        for (const studentId of formData.selectedStudents) {
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

        if (participantError) throw participantError;
      }

      toast({
        title: "Sucesso",
        description: `${insertedClasses.length} aula(s) agendada(s) com sucesso!`,
      });

      await loadClasses();
    } catch (error: any) {
      console.error('Erro ao agendar aula:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao agendar a aula. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelClass = (classId: string, className: string, classDate: string) => {
    setCancellationModal({
      isOpen: true,
      classId,
      className,
      classDate
    });
  };

  const handleCancellationComplete = () => {
    loadClasses(); // Reload classes to show updated status
    setCancellationModal({ isOpen: false, classId: "", className: "", classDate: "" });
  };

  const handleCompleteClass = (classData: CalendarClass) => {
    setReportModal({ isOpen: true, classData });
  };

  const handleReportCreated = () => {
    loadClasses(); // Reload classes to show updated status
    setReportModal({ isOpen: false, classData: null });
  };

  // Show loading until we're sure of user role
  if (authLoading || !profile || (!isProfessor && !isAluno)) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="space-y-2">
            <div className="h-8 bg-muted/50 rounded animate-pulse max-w-xs" />
            <div className="h-4 bg-muted/30 rounded animate-pulse max-w-md" />
          </div>
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted/20 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">
            {isProfessor ? "Agenda de Aulas" : "Minhas Aulas"}
          </h1>
          <p className="text-muted-foreground">
            {isProfessor 
              ? "Gerencie sua agenda, horários de trabalho e disponibilidade"
              : "Veja suas próximas aulas"
            }
          </p>
        </div>

        {/* Calendar View */}
        <SimpleCalendar 
          classes={calendarClasses}
          availabilityBlocks={availabilityBlocks}
          isProfessor={isProfessor}
          onConfirmClass={handleConfirmClass}
          onCancelClass={handleCancelClass}
          onCompleteClass={handleCompleteClass}
          loading={loading}
        />

        {/* Availability Manager - Only for professors */}
        {isProfessor && (
          <AvailabilityManager onAvailabilityChange={loadAvailabilityBlocks} />
        )}

        {/* Schedule/Add Class Button */}
        {isProfessor && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Gerenciar Agenda</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Agendar Nova Aula
              </Button>
              
              <ClassForm
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                students={students}
                services={services}
                existingClasses={classes}
                onSubmit={handleAddClass}
                loading={submitting}
              />
            </CardContent>
          </Card>
        )}

        {/* Infinite Recurrence Status */}
        {isGenerating && (
          <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  Gerando aulas recorrentes automaticamente...
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      
      <CancellationModal
        isOpen={cancellationModal.isOpen}
        onClose={() => setCancellationModal({ isOpen: false, classId: "", className: "", classDate: "" })}
        classId={cancellationModal.classId}
        className={cancellationModal.className}
        classDate={cancellationModal.classDate}
        onCancellationComplete={handleCancellationComplete}
      />
      
      <ClassReportModal
        isOpen={reportModal.isOpen}
        onOpenChange={(open) => !open && setReportModal({ isOpen: false, classData: null })}
        classData={reportModal.classData}
        onReportCreated={handleReportCreated}
      />
    </Layout>
  );
}
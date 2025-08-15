import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { CalendarView, CalendarClass, AvailabilityBlock } from "@/components/Calendar/CalendarView";
import { AvailabilityManager } from "@/components/Availability/AvailabilityManager";
import { ClassForm } from "@/components/ClassForm/ClassForm";
import { CancellationModal } from "@/components/CancellationModal";

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

export default function Agenda() {
  const { profile, isProfessor } = useAuth();
  const { toast } = useToast();
  
  const [classes, setClasses] = useState<ClassWithParticipants[]>([]);
  const [calendarClasses, setCalendarClasses] = useState<CalendarClass[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellationModal, setCancellationModal] = useState<{
    isOpen: boolean;
    classId: string;
    className: string;
    classDate: string;
  }>({ isOpen: false, classId: "", className: "", classDate: "" });

  useEffect(() => {
    if (profile) {
      loadClasses();
      if (isProfessor) {
        loadStudents();
        loadAvailabilityBlocks();
      }
    }
  }, [profile, isProfessor]);

  const loadClasses = async () => {
    if (!profile?.id) return;

    try {
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
      }
      return next;
    };

    const endDate = recurrence.end_date ? new Date(recurrence.end_date) : null;
    const maxOccurrences = recurrence.occurrences || 50;

    for (let i = 1; i < maxOccurrences; i++) {
      currentDate = getNextDate(currentDate, recurrence.frequency);
      
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
      
      // Create base class data
      const baseClassData = {
        teacher_id: profile.id,
        class_date: classDateTime.toISOString(),
        duration_minutes: formData.duration_minutes,
        notes: formData.notes || null,
        status: 'pendente',
        is_experimental: formData.is_experimental,
        is_group_class: formData.is_group_class,
        recurrence_pattern: formData.recurrence ? formData.recurrence : null
      };

      // Generate classes (single or recurring)
      const classesToCreate = formData.recurrence 
        ? generateRecurringClasses(baseClassData, formData.recurrence)
        : [baseClassData];

      // Insert classes
      const { data: insertedClasses, error: classError } = await supabase
        .from('classes')
        .insert(classesToCreate)
        .select();

      if (classError) throw classError;

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

      const { error: participantError } = await supabase
        .from('class_participants')
        .insert(participantInserts);

      if (participantError) throw participantError;

      toast({
        title: "Sucesso",
        description: `${classesToCreate.length} aula(s) agendada(s) com sucesso!`,
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
                onSubmit={handleAddClass}
                loading={submitting}
              />
            </CardContent>
          </Card>
        )}

        {/* Calendar View */}
        <CalendarView 
          classes={calendarClasses}
          availabilityBlocks={availabilityBlocks}
          isProfessor={isProfessor}
          onConfirmClass={handleConfirmClass}
          onCancelClass={handleCancelClass}
          loading={loading}
        />
      </div>
      
      <CancellationModal
        isOpen={cancellationModal.isOpen}
        onClose={() => setCancellationModal({ isOpen: false, classId: "", className: "", classDate: "" })}
        classId={cancellationModal.classId}
        className={cancellationModal.className}
        classDate={cancellationModal.classDate}
        onCancellationComplete={handleCancellationComplete}
      />
    </Layout>
  );
}
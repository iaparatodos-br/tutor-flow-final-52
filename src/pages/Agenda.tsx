import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { CalendarView, CalendarClass, AvailabilityBlock } from "@/components/Calendar/CalendarView";
import { AvailabilityManager } from "@/components/Availability/AvailabilityManager";

interface ClassWithStudent {
  id: string;
  class_date: string;
  duration_minutes: number;
  status: 'pendente' | 'confirmada' | 'cancelada' | 'concluida';
  notes: string | null;
  student: {
    name: string;
    email: string;
  };
}

interface Student {
  id: string;
  name: string;
}

export default function Agenda() {
  const { profile, isProfessor } = useAuth();
  const { toast } = useToast();
  
  const [classes, setClasses] = useState<ClassWithStudent[]>([]);
  const [calendarClasses, setCalendarClasses] = useState<CalendarClass[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newClass, setNewClass] = useState({
    student_id: '',
    class_date: '',
    time: '',
    duration_minutes: 60,
    notes: ''
  });
  const [validationErrors, setValidationErrors] = useState({ student: false, date: false, time: false });

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
          profiles!classes_student_id_fkey (
            name,
            email
          )
        `)
        .eq(isProfessor ? 'teacher_id' : 'student_id', profile.id)
        .gte('class_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Show classes from 30 days ago
        .order('class_date');

      if (error) throw error;
      
      const mappedClasses = (data || []).map(item => ({
        ...item,
        student: item.profiles
      })) as ClassWithStudent[];
      
      setClasses(mappedClasses);

      // Transform for calendar view
      const calendarEvents: CalendarClass[] = mappedClasses.map(cls => {
        const startDate = new Date(cls.class_date);
        const endDate = new Date(startDate.getTime() + (cls.duration_minutes * 60 * 1000));
        
        return {
          id: cls.id,
          title: `${cls.student?.name || 'Aluno'} - ${cls.duration_minutes}min`,
          start: startDate,
          end: endDate,
          status: cls.status,
          student: cls.student,
          notes: cls.notes || undefined
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

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const errors = {
      student: !newClass.student_id,
      date: !newClass.class_date,
      time: !newClass.time
    };
    setValidationErrors(errors);
    
    if (!profile?.id || !newClass.student_id || !newClass.class_date || !newClass.time || Object.values(errors).some(Boolean)) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    try {
      const classDateTime = new Date(`${newClass.class_date}T${newClass.time}`);
      
      const { error } = await supabase
        .from('classes')
        .insert({
          teacher_id: profile.id,
          student_id: newClass.student_id,
          class_date: classDateTime.toISOString(),
          duration_minutes: newClass.duration_minutes,
          notes: newClass.notes || null,
          status: 'pendente'
        });

      if (error) {
        console.error('Erro ao agendar aula:', error);
        toast({
          title: "Erro",
          description: "Erro ao agendar a aula. Tente novamente.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Sucesso",
        description: "Aula agendada com sucesso!",
      });

      setIsDialogOpen(false);
      setNewClass({
        student_id: '',
        class_date: '',
        time: '',
        duration_minutes: 60,
        notes: ''
      });
      setValidationErrors({ student: false, date: false, time: false });
      
      await loadClasses();
    } catch (error) {
      console.error('Erro ao agendar aula:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado. Tente novamente.",
        variant: "destructive",
      });
    }
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
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Agendar Nova Aula
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Agendar Nova Aula</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddClass} className="space-y-4">
                    <div>
                      <Label htmlFor="student">Aluno *</Label>
                      <Select 
                        value={newClass.student_id} 
                        onValueChange={(value) => {
                          setNewClass(prev => ({ ...prev, student_id: value }));
                          setValidationErrors(prev => ({ ...prev, student: false }));
                        }}
                      >
                        <SelectTrigger className={validationErrors.student ? "border-destructive" : ""}>
                          <SelectValue placeholder="Selecione um aluno" />
                        </SelectTrigger>
                        <SelectContent>
                          {students.map((student) => (
                            <SelectItem key={student.id} value={student.id}>
                              {student.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="date">Data *</Label>
                      <Input
                        id="date"
                        type="date"
                        value={newClass.class_date}
                        onChange={(e) => {
                          setNewClass(prev => ({ ...prev, class_date: e.target.value }));
                          setValidationErrors(prev => ({ ...prev, date: false }));
                        }}
                        className={validationErrors.date ? "border-destructive" : ""}
                        required
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="time">Horário *</Label>
                      <Input
                        id="time"
                        type="time"
                        value={newClass.time}
                        onChange={(e) => {
                          setNewClass(prev => ({ ...prev, time: e.target.value }));
                          setValidationErrors(prev => ({ ...prev, time: false }));
                        }}
                        className={validationErrors.time ? "border-destructive" : ""}
                        required
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="duration">Duração (minutos)</Label>
                      <Select value={newClass.duration_minutes.toString()} onValueChange={(value) => 
                        setNewClass(prev => ({ ...prev, duration_minutes: parseInt(value) }))
                      }>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 minutos</SelectItem>
                          <SelectItem value="60">1 hora</SelectItem>
                          <SelectItem value="90">1h 30min</SelectItem>
                          <SelectItem value="120">2 horas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="notes">Observações</Label>
                      <Textarea
                        id="notes"
                        placeholder="Observações sobre a aula..."
                        value={newClass.notes}
                        onChange={(e) => setNewClass(prev => ({ ...prev, notes: e.target.value }))}
                      />
                    </div>
                    
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit">
                        Agendar
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )}

        {/* Calendar View */}
        <CalendarView 
          classes={calendarClasses}
          availabilityBlocks={availabilityBlocks}
          isProfessor={isProfessor}
          onConfirmClass={handleConfirmClass}
          loading={loading}
        />
      </div>
    </Layout>
  );
}
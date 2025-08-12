import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, User, CheckCircle, Plus } from "lucide-react";

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

  useEffect(() => {
    if (profile) {
      loadClasses();
      if (isProfessor) {
        loadStudents();
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
        .gte('class_date', new Date().toISOString())
        .order('class_date');

      if (error) throw error;
      setClasses((data || []).map(item => ({
        ...item,
        student: item.profiles
      })) as ClassWithStudent[]);
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
    
    if (!profile?.id || !newClass.student_id || !newClass.class_date || !newClass.time) {
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

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pendente: { label: "Pendente", variant: "secondary" as const },
      confirmada: { label: "Confirmada", variant: "default" as const },
      cancelada: { label: "Cancelada", variant: "destructive" as const },
      concluida: { label: "Concluída", variant: "outline" as const }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendente;
    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('pt-BR'),
      time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
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
              ? "Gerencie suas próximas aulas agendadas"
              : "Veja suas próximas aulas"
            }
          </p>
        </div>

        {/* Classes List */}
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Próximas Aulas ({classes.length})
            </CardTitle>
            {isProfessor && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Agendar Aula
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Agendar Nova Aula</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddClass} className="space-y-4">
                    <div>
                      <Label htmlFor="student">Aluno *</Label>
                      <Select value={newClass.student_id} onValueChange={(value) => 
                        setNewClass(prev => ({ ...prev, student_id: value }))
                      }>
                        <SelectTrigger>
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
                        onChange={(e) => setNewClass(prev => ({ ...prev, class_date: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="time">Horário *</Label>
                      <Input
                        id="time"
                        type="time"
                        value={newClass.time}
                        onChange={(e) => setNewClass(prev => ({ ...prev, time: e.target.value }))}
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
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
                <p className="text-muted-foreground">Carregando agenda...</p>
              </div>
            ) : classes.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Nenhuma aula agendada</h3>
                <p className="text-muted-foreground">
                  {isProfessor 
                    ? "Suas próximas aulas aparecerão aqui"
                    : "Você não tem aulas agendadas no momento"
                  }
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {isProfessor ? "Aluno" : "Professor"}
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Status</TableHead>
                    {isProfessor && <TableHead>Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.map((classItem) => {
                    const { date, time } = formatDate(classItem.class_date);
                    return (
                      <TableRow key={classItem.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{classItem.student?.name}</p>
                              <p className="text-sm text-muted-foreground">{classItem.student?.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {date}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            {time}
                          </div>
                        </TableCell>
                        <TableCell>{classItem.duration_minutes} min</TableCell>
                        <TableCell>
                          {getStatusBadge(classItem.status)}
                        </TableCell>
                        {isProfessor && (
                          <TableCell>
                            {classItem.status === 'pendente' && (
                              <Button
                                size="sm"
                                onClick={() => handleConfirmClass(classItem.id)}
                                className="bg-gradient-success shadow-success hover:bg-success"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Confirmar
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
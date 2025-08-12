import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, User, CheckCircle } from "lucide-react";

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

export default function Agenda() {
  const { profile, isProfessor } = useAuth();
  const { toast } = useToast();
  
  const [classes, setClasses] = useState<ClassWithStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      loadClasses();
    }
  }, [profile]);

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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Próximas Aulas ({classes.length})
            </CardTitle>
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
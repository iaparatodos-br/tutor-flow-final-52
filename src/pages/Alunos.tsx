import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Mail, User } from "lucide-react";

interface Student {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export default function Alunos() {
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: "", email: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadStudents();
    }
  }, [profile]);

  const loadStudents = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, created_at')
        .eq('teacher_id', profile.id)
        .eq('role', 'aluno')
        .order('name');

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
      toast({
        title: "Erro ao carregar alunos",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;

    setSubmitting(true);
    
    try {
      // Primeiro, criar um usuário temporário no auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newStudent.email,
        password: Math.random().toString(36).substring(2, 15), // senha temporária
        email_confirm: true,
        user_metadata: {
          name: newStudent.name,
          role: 'aluno'
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // Inserir na tabela profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            name: newStudent.name,
            email: newStudent.email,
            role: 'aluno',
            teacher_id: profile.id
          });

        if (profileError) throw profileError;
      }

      toast({
        title: "Aluno adicionado com sucesso!",
        description: `${newStudent.name} foi cadastrado`,
      });
      
      setNewStudent({ name: "", email: "" });
      setIsAddDialogOpen(false);
      loadStudents();
      
    } catch (error: any) {
      console.error('Erro ao adicionar aluno:', error);
      toast({
        title: "Erro ao adicionar aluno",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Tem certeza que deseja excluir o aluno ${studentName}?`)) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', studentId);

      if (error) throw error;

      toast({
        title: "Aluno removido",
        description: `${studentName} foi removido da sua lista`,
      });
      
      loadStudents();
    } catch (error: any) {
      console.error('Erro ao excluir aluno:', error);
      toast({
        title: "Erro ao excluir aluno",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Gestão de Alunos</h1>
            <p className="text-muted-foreground">
              Gerencie seus alunos cadastrados
            </p>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary shadow-primary hover:bg-primary-hover">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Aluno
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddStudent}>
                <DialogHeader>
                  <DialogTitle>Adicionar Novo Aluno</DialogTitle>
                  <DialogDescription>
                    Insira os dados do aluno para cadastrá-lo na sua plataforma
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="student-name">Nome completo</Label>
                    <Input
                      id="student-name"
                      type="text"
                      placeholder="Nome do aluno"
                      value={newStudent.name}
                      onChange={(e) => setNewStudent(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="student-email">E-mail</Label>
                    <Input
                      id="student-email"
                      type="email"
                      placeholder="email@exemplo.com"
                      value={newStudent.email}
                      onChange={(e) => setNewStudent(prev => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Cadastrando..." : "Cadastrar Aluno"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Students List */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Lista de Alunos ({students.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
                <p className="text-muted-foreground">Carregando alunos...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-8">
                <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Nenhum aluno cadastrado</h3>
                <p className="text-muted-foreground mb-4">
                  Comece adicionando seu primeiro aluno
                </p>
                <Button 
                  onClick={() => setIsAddDialogOpen(true)}
                  className="bg-gradient-primary shadow-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Primeiro Aluno
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Data de Cadastro</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          {student.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-4 w-4" />
                          {student.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(student.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => handleDeleteStudent(student.id, student.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
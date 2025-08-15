import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { StudentFormModal } from "@/components/StudentFormModal";
import { Plus, Edit, Trash2, Mail, User, Calendar, UserCheck, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Student {
  id: string;
  name: string;
  email: string;
  created_at: string;
  guardian_name?: string;
  guardian_email?: string;
  guardian_phone?: string;
  billing_day?: number;
}

export default function Alunos() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
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
        .select('id, name, email, created_at, guardian_name, guardian_email, guardian_phone, billing_day')
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

  const handleAddStudent = async (formData: any) => {
    if (!profile?.id) return;

    setSubmitting(true);
    
    try {
      // Generate a temporary ID for the student
      const tempUserId = crypto.randomUUID();

      // Insert student data into profiles table with billing information
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: tempUserId,
          name: formData.name,
          email: formData.email,
          role: 'aluno',
          teacher_id: profile.id,
          guardian_name: formData.isOwnResponsible ? formData.name : formData.guardian_name,
          guardian_email: formData.isOwnResponsible ? formData.email : formData.guardian_email,
          guardian_phone: formData.isOwnResponsible ? formData.phone : (formData.guardian_phone || null),
          billing_day: formData.billing_day
        });

      if (profileError) {
        console.error('Erro ao criar perfil:', profileError);
        toast({
          title: "Erro",
          description: "Erro ao salvar dados do aluno.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Aluno adicionado com sucesso!",
        description: `${formData.name} foi cadastrado com as configurações de cobrança.`,
      });
      
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

  const handleEditStudent = (student: Student) => {
    setEditingStudent(student);
    setIsEditDialogOpen(true);
  };

  const handleUpdateStudent = async (formData: any) => {
    if (!profile?.id || !editingStudent) return;

    setSubmitting(true);
    
    try {
      // Update student data in profiles table
      const { error } = await supabase
        .from('profiles')
        .update({
          name: formData.name,
          email: formData.email,
          guardian_name: formData.isOwnResponsible ? formData.name : formData.guardian_name,
          guardian_email: formData.isOwnResponsible ? formData.email : formData.guardian_email,
          guardian_phone: formData.isOwnResponsible ? formData.phone : (formData.guardian_phone || null),
          billing_day: formData.billing_day
        })
        .eq('id', editingStudent.id);

      if (error) {
        console.error('Erro ao atualizar perfil:', error);
        toast({
          title: "Erro",
          description: "Erro ao salvar alterações do aluno.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Aluno atualizado com sucesso!",
        description: `As informações de ${formData.name} foram atualizadas.`,
      });
      
      setIsEditDialogOpen(false);
      setEditingStudent(null);
      loadStudents();
      
    } catch (error: any) {
      console.error('Erro ao atualizar aluno:', error);
      toast({
        title: "Erro ao atualizar aluno",
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
          
          <Button 
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-gradient-primary shadow-primary hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Aluno
          </Button>
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
                    <TableHead>Responsável</TableHead>
                    <TableHead>Dia Cobrança</TableHead>
                    <TableHead>Data de Cadastro</TableHead>
                    <TableHead className="w-[120px]">Ações</TableHead>
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
                        <div className="flex items-center gap-2">
                          {student.guardian_name ? (
                            <>
                              {student.guardian_name === student.name ? (
                                <Badge variant="outline" className="text-xs">
                                  <UserCheck className="h-3 w-3 mr-1" />
                                  Próprio aluno
                                </Badge>
                              ) : (
                                <div>
                                  <p className="text-sm font-medium">{student.guardian_name}</p>
                                  <p className="text-xs text-muted-foreground">{student.guardian_email}</p>
                                </div>
                              )}
                            </>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Não configurado
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{student.billing_day || 15}</span>
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
                            onClick={() => navigate(`/alunos/${student.id}`)}
                            title="Ver perfil completo"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditStudent(student)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
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

        {/* Student Form Modals */}
        <StudentFormModal
          isOpen={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onSubmit={handleAddStudent}
          isSubmitting={submitting}
          title="Adicionar Novo Aluno"
          description="Insira os dados do aluno e configurações de cobrança"
        />

        <StudentFormModal
          isOpen={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSubmit={handleUpdateStudent}
          isSubmitting={submitting}
          student={editingStudent || undefined}
          title="Editar Aluno"
          description="Altere os dados do aluno e configurações de cobrança"
        />
      </div>
    </Layout>
  );
}
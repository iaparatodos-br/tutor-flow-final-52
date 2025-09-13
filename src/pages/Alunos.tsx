import { useEffect, useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { StudentFormModal } from "@/components/StudentFormModal";
import { Plus, Edit, Trash2, Mail, User, Calendar, UserCheck, Eye, AlertTriangle, Unlink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { FeatureGate } from "@/components/FeatureGate";

interface Student {
  id: string;
  name: string;
  email: string;
  created_at: string;
  guardian_name?: string;
  guardian_email?: string;
  guardian_phone?: string;
  billing_day?: number;
  relationship_id?: string;
  stripe_customer_id?: string;
}

export default function Alunos() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentPlan, subscription, getStudentOverageInfo } = useSubscription();
  
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
      const { data, error } = await supabase.rpc('get_teacher_students', {
        teacher_user_id: profile.id
      });

      if (error) throw error;
      
      // Transform the data to match the Student interface
      const transformedData = data?.map((student: any) => ({
        id: student.student_id,
        name: student.student_name,
        email: student.student_email,
        created_at: student.created_at,
        guardian_name: student.guardian_name,
        guardian_email: student.guardian_email,
        guardian_phone: student.guardian_phone,
        billing_day: student.billing_day,
        relationship_id: student.relationship_id,
        stripe_customer_id: student.stripe_customer_id
      })) || [];

      setStudents(transformedData);
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
      // Check if adding this student would exceed limits and trigger billing
      if (currentPlan && currentPlan.slug !== 'free') {
        const { isOverLimit, additionalCost } = getStudentOverageInfo(students.length);
        
        if (isOverLimit && subscription) {
          // Setup billing for extra students
          const extraStudents = students.length - currentPlan.student_limit + 1;
          
          try {
            const { data: billingData, error: billingError } = await supabase.functions.invoke('handle-student-overage', {
              body: {
                extraStudents,
                planLimit: currentPlan.student_limit
              }
            });

            if (billingError) {
              console.error('Error setting up billing:', billingError);
              toast({
                title: 'Aviso de Cobrança',
                description: `O aluno será adicionado, mas pode haver cobrança adicional de R$ ${(additionalCost / 100).toFixed(2)}.`,
                variant: "default",
              });
            } else if (billingData?.success) {
              toast({
                title: 'Cobrança Configurada',
                description: billingData.message,
                variant: "default",
              });
            }
          } catch (err) {
            console.error('Billing automation error:', err);
            // Continue with student creation even if billing setup fails
          }
        }
      }
      
      // Create student via Edge Function with admin privileges
      // Don't send localhost URLs - let the function handle the redirect URL
      const redirectUrl = window.location.hostname === 'localhost' 
        ? undefined 
        : `${window.location.origin}/auth/callback`;

      console.log('Calling create-student function...');
      const { data, error } = await supabase.functions.invoke('create-student', {
        body: {
          name: formData.name,
          email: formData.email,
          teacher_id: profile.id,
          redirect_url: redirectUrl,
          guardian_name: formData.isOwnResponsible ? formData.name : formData.guardian_name,
          guardian_email: formData.isOwnResponsible ? formData.email : formData.guardian_email,
          guardian_phone: formData.isOwnResponsible ? formData.phone : (formData.guardian_phone || null),
          billing_day: formData.billing_day,
          notify_professor_email: profile.email,
          professor_name: profile.name,
        }
      });

      console.log('Supabase function response:', { data, error });
      
      // Check for errors in the response
      if (error) {
        console.error('Supabase function error object:', error);
        console.log('Error type:', typeof error);
        console.log('Error JSON:', JSON.stringify(error));
        
        toast({
          title: 'Erro',
          description: 'Este e-mail já está sendo utilizado por outro aluno ou professor',
          variant: 'destructive',
        });
        return;
      }
      
      // Check if the function returned success: false
      if (data && !data.success) {
        console.log('Function returned success: false, error:', data.error);
        
        toast({
          title: 'Erro ao cadastrar aluno',
          description: data.error || 'Este e-mail já está sendo utilizado por outro aluno ou professor',
          variant: 'destructive',
        });
        return;
      }

      // Success case
      toast({
        title: 'Aluno convidado com sucesso!',
        description: `${formData.name} receberá um e-mail para concluir o cadastro.`,
      });
      
      setIsAddDialogOpen(false);
      loadStudents();
        
    } catch (error: any) {
      console.error('Erro ao adicionar aluno:', error);
      toast({
        title: 'Erro ao adicionar aluno',
        description: error.message || 'Tente novamente mais tarde',
        variant: 'destructive',
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
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: formData.name,
          email: formData.email,
          guardian_name: formData.isOwnResponsible ? formData.name : formData.guardian_name,
          guardian_email: formData.isOwnResponsible ? formData.email : formData.guardian_email,
          guardian_phone: formData.isOwnResponsible ? formData.phone : (formData.guardian_phone || null),
        })
        .eq('id', editingStudent.id);

      if (profileError) {
        console.error('Erro ao atualizar perfil:', profileError);
        toast({
          title: "Erro",
          description: "Erro ao salvar alterações do aluno.",
          variant: "destructive",
        });
        return;
      }

      // Update relationship data if relationship exists
      if (editingStudent.relationship_id) {
        const { error: relationshipError } = await supabase
          .from('teacher_student_relationships')
          .update({
            billing_day: formData.billing_day,
            stripe_customer_id: formData.stripe_customer_id
          })
          .eq('id', editingStudent.relationship_id);

        if (relationshipError) {
          console.error('Erro ao atualizar relacionamento:', relationshipError);
          toast({
            title: "Aviso",
            description: "Perfil atualizado, mas houve erro ao salvar configurações de cobrança.",
            variant: "default",
          });
        }
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

  const handleUnlinkStudent = async (student: Student) => {
    if (!confirm(`Tem certeza que deseja desvincular o aluno ${student.name}? O aluno não será excluído, apenas removido da sua lista.`)) return;

    try {
      // Remove the relationship, not the student profile
      const { error } = await supabase
        .from('teacher_student_relationships')
        .delete()
        .eq('id', student.relationship_id);

      if (error) throw error;

      toast({
        title: "Aluno desvinculado",
        description: `${student.name} foi removido da sua lista`,
      });
      
      loadStudents();
    } catch (error: any) {
      console.error('Erro ao desvincular aluno:', error);
      toast({
        title: "Erro ao desvincular aluno",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE o aluno ${studentName}? Esta ação não pode ser desfeita e removerá o aluno de todos os professores.`)) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', studentId);

      if (error) throw error;

      toast({
        title: "Aluno excluído",
        description: `${studentName} foi excluído permanentemente`,
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
            {currentPlan && (() => {
              const { isOverLimit, additionalCost, message } = getStudentOverageInfo(students.length);
              
              if (isOverLimit && currentPlan.slug !== 'free') {
                return (
                  <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-md border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      {students.length} de {currentPlan.student_limit} alunos incluídos no plano
                    </p>
                  </div>
                );
              }
              
              if (currentPlan.slug === 'free' && students.length >= currentPlan.student_limit - 1) {
                return (
                  <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-md border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      {students.length} de {currentPlan.student_limit} alunos (plano gratuito)
                    </p>
                  </div>
                );
              }
              
              return null;
            })()}
          </div>
          
          <FeatureGate studentCount={students.length} showUpgrade={true}>
            <Button 
              onClick={() => setIsAddDialogOpen(true)}
              className="bg-gradient-primary shadow-primary hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Aluno
            </Button>
          </FeatureGate>
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
                <FeatureGate studentCount={students.length} showUpgrade={true}>
                  <Button 
                    onClick={() => setIsAddDialogOpen(true)}
                    className="bg-gradient-primary shadow-primary"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Primeiro Aluno
                  </Button>
                </FeatureGate>
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
                            className="hover:bg-orange-100 hover:text-orange-600"
                            onClick={() => handleUnlinkStudent(student)}
                            title="Desvincular aluno (não excluir)"
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => handleDeleteStudent(student.id, student.name)}
                            title="Excluir aluno permanentemente"
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
          currentStudentCount={students.length}
          title="Adicionar Novo Aluno"
          description="Insira os dados do aluno e configurações de cobrança"
        />

        <StudentFormModal
          isOpen={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSubmit={handleUpdateStudent}
          isSubmitting={submitting}
          currentStudentCount={students.length}
          student={editingStudent || undefined}
          title="Editar Aluno"
          description="Altere os dados do aluno e configurações de cobrança"
        />
      </div>
    </Layout>
  );
}

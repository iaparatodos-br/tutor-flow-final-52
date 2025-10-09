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
import { CreateInvoiceModal } from "@/components/CreateInvoiceModal";
import { BusinessProfileWarningModal } from "@/components/BusinessProfileWarningModal";
import { Plus, Edit, Trash2, Mail, User, Calendar, UserCheck, Eye, AlertTriangle, DollarSign, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { UpgradeBanner } from "@/components/UpgradeBanner";
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
  guardian_cpf?: string;
  guardian_address_street?: string;
  guardian_address_city?: string;
  guardian_address_state?: string;
  guardian_address_postal_code?: string;
  billing_day?: number;
  relationship_id?: string;
  stripe_customer_id?: string;
  business_profile_id?: string;
  email_confirmed?: boolean;
}
export default function Alunos() {
  const {
    profile
  } = useProfile();
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  const {
    currentPlan,
    subscription,
    getStudentOverageInfo,
    hasFeature
  } = useSubscription();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningStudent, setWarningStudent] = useState<Student | null>(null);
  const [warningAction, setWarningAction] = useState("");
  useEffect(() => {
    if (profile?.id) {
      loadStudents();
    }
  }, [profile]);
  const loadStudents = async () => {
    if (!profile?.id) return;
    try {
      const {
        data,
        error
      } = await supabase.rpc('get_teacher_students', {
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
        guardian_cpf: student.guardian_cpf,
        guardian_address_street: student.guardian_address_street,
        guardian_address_city: student.guardian_address_city,
        guardian_address_state: student.guardian_address_state,
        guardian_address_postal_code: student.guardian_address_postal_code,
        billing_day: student.billing_day,
        relationship_id: student.relationship_id,
        stripe_customer_id: student.stripe_customer_id,
        business_profile_id: student.business_profile_id
      })) || [];

      // Check email confirmation status for all students
      if (transformedData.length > 0) {
        const studentIds = transformedData.map((s: Student) => s.id);
        const { data: confirmationData, error: confirmError } = await supabase.functions.invoke('check-email-confirmation', {
          body: { student_ids: studentIds }
        });

        if (!confirmError && confirmationData?.success) {
          // Add confirmation status to each student
          transformedData.forEach((student: Student) => {
            student.email_confirmed = confirmationData.confirmationStatus[student.id] || false;
          });
        }
      }

      setStudents(transformedData);
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
      toast({
        title: "Erro ao carregar alunos",
        description: "Tente novamente mais tarde",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const handleAddStudent = async (formData: any) => {
    if (!profile?.id) return;
    setSubmitting(true);
    try {
      // Create student via Edge Function with admin privileges (backend handles ALL billing logic)
      // Don't send localhost URLs - let the function handle the redirect URL
      const redirectUrl = window.location.hostname === 'localhost' ? undefined : `${window.location.origin}/auth/callback`;
      console.log('Calling create-student function...');
      const {
        data,
        error
      } = await supabase.functions.invoke('create-student', {
        body: {
          name: formData.name,
          email: formData.email,
          teacher_id: profile.id,
          redirect_url: redirectUrl,
          guardian_name: formData.isOwnResponsible ? formData.name : formData.guardian_name,
          guardian_email: formData.isOwnResponsible ? formData.email : formData.guardian_email,
          guardian_phone: formData.isOwnResponsible ? formData.phone : formData.guardian_phone || null,
          guardian_cpf: formData.isOwnResponsible ? null : formData.guardian_cpf || null,
          guardian_address_street: formData.isOwnResponsible ? null : formData.guardian_address_street || null,
          guardian_address_city: formData.isOwnResponsible ? null : formData.guardian_address_city || null,
          guardian_address_state: formData.isOwnResponsible ? null : formData.guardian_address_state || null,
          guardian_address_postal_code: formData.isOwnResponsible ? null : formData.guardian_address_postal_code || null,
          billing_day: formData.billing_day,
          notify_professor_email: profile.email,
          professor_name: profile.name,
          business_profile_id: formData.business_profile_id
        }
      });
      console.log('Supabase function response:', {
        data,
        error
      });

      // Check for errors in the response
      if (error) {
        console.error('Supabase function error object:', error);
        console.log('Error type:', typeof error);
        console.log('Error JSON:', JSON.stringify(error));
        toast({
          title: 'Erro',
          description: 'Este e-mail já está sendo utilizado por outro aluno ou professor',
          variant: 'destructive'
        });
        return;
      }

      // Check if the function returned success: false
      if (data && !data.success) {
        console.log('Function returned success: false, error:', data.error);
        toast({
          title: 'Erro ao cadastrar aluno',
          description: data.error || 'Este e-mail já está sendo utilizado por outro aluno ou professor',
          variant: 'destructive'
        });
        return;
      }

      // Success case - check if there's billing info or warning in the response
      let successMessage = data?.is_new_student 
        ? `${formData.name} receberá um e-mail para concluir o cadastro.`
        : `${formData.name} foi vinculado à sua conta.`;
      
      if (data?.billing_warning) {
        successMessage += ` ⚠️ ${data.billing_warning}`;
      } else if (data?.billing?.message) {
        successMessage += ` ${data.billing.message}`;
      }
      
      toast({
        title: 'Aluno convidado com sucesso!',
        description: successMessage,
        duration: data?.billing_warning || data?.billing ? 5000 : 3000,
      });
      setIsAddDialogOpen(false);
      loadStudents();
    } catch (error: any) {
      console.error('Erro ao adicionar aluno:', error);
      toast({
        title: 'Erro ao adicionar aluno',
        description: error.message || 'Tente novamente mais tarde',
        variant: 'destructive'
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
      // Use the new update-student-details function
      const {
        data,
        error
      } = await supabase.functions.invoke('update-student-details', {
        body: {
          student_id: editingStudent.id,
          teacher_id: profile.id,
          relationship_id: editingStudent.relationship_id,
          student_name: formData.name,
          guardian_name: formData.isOwnResponsible ? formData.name : formData.guardian_name,
          guardian_email: formData.isOwnResponsible ? formData.email : formData.guardian_email,
          guardian_phone: formData.isOwnResponsible ? formData.phone : formData.guardian_phone || null,
          guardian_cpf: formData.isOwnResponsible ? null : formData.guardian_cpf || null,
          guardian_address_street: formData.isOwnResponsible ? null : formData.guardian_address_street || null,
          guardian_address_city: formData.isOwnResponsible ? null : formData.guardian_address_city || null,
          guardian_address_state: formData.isOwnResponsible ? null : formData.guardian_address_state || null,
          guardian_address_postal_code: formData.isOwnResponsible ? null : formData.guardian_address_postal_code || null,
          billing_day: formData.billing_day,
          business_profile_id: formData.business_profile_id
        }
      });
      if (error || data && !data.success) {
        console.error('Erro ao atualizar aluno:', error || data);
        toast({
          title: "Erro",
          description: data?.error || "Erro ao salvar alterações do aluno.",
          variant: "destructive"
        });
        return;
      }
      toast({
        title: "Aluno atualizado com sucesso!",
        description: `As informações de ${formData.name} foram atualizadas.`
      });
      setIsEditDialogOpen(false);
      setEditingStudent(null);
      loadStudents();
    } catch (error: any) {
      console.error('Erro ao atualizar aluno:', error);
      toast({
        title: "Erro ao atualizar aluno",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };
  const handleSmartDelete = async (student: Student) => {
    if (!student.relationship_id) {
      toast({
        title: "Erro",
        description: "Não foi possível encontrar o relacionamento do aluno",
        variant: "destructive"
      });
      return;
    }
    try {
      // Call the smart delete function to determine the action
      const {
        data,
        error
      } = await supabase.functions.invoke('smart-delete-student', {
        body: {
          student_id: student.id,
          teacher_id: profile?.id,
          relationship_id: student.relationship_id
        }
      });
      if (error) {
        console.error('Smart delete error:', error);
        toast({
          title: "Erro",
          description: "Erro ao processar a remoção do aluno",
          variant: "destructive"
        });
        return;
      }
      if (data && !data.success) {
        toast({
          title: "Erro",
          description: data.error || "Erro ao processar a remoção do aluno",
          variant: "destructive"
        });
        return;
      }

      // Show generic success message
      toast({
        title: "Aluno removido com sucesso",
        description: `${student.name} perdeu acesso à sua área da plataforma`
      });
      loadStudents();
    } catch (error: any) {
      console.error('Erro ao remover aluno:', error);
      toast({
        title: "Erro ao remover aluno",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    }
  };
  const handleConfirmSmartDelete = async (student: Student) => {
    const confirmMessage = `Tem certeza que deseja remover o aluno ${student.name}?\n\n` + `O aluno perderá acesso à sua área da plataforma.`;
    if (!confirm(confirmMessage)) return;
    await handleSmartDelete(student);
  };
  const checkBusinessProfileOrWarn = (student: Student, action: string, callback: () => void) => {
    if (!student.business_profile_id) {
      setWarningStudent(student);
      setWarningAction(action);
      setWarningModalOpen(true);
      return false;
    }
    callback();
    return true;
  };
  const studentsWithoutBusinessProfile = students.filter(s => !s.business_profile_id);

  const handleResendInvitation = async (student: Student) => {
    if (!student.relationship_id) {
      toast({
        title: "Erro",
        description: "Não foi possível encontrar o relacionamento do aluno",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('resend-student-invitation', {
        body: {
          student_id: student.id,
          relationship_id: student.relationship_id
        }
      });

      if (error || (data && !data.success)) {
        console.error('Resend invitation error:', error || data);
        toast({
          title: "Erro",
          description: data?.error || "Erro ao reenviar convite",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Convite reenviado!",
        description: `${student.name} receberá um novo e-mail de confirmação.`
      });
      
      // Reload students to update confirmation status
      loadStudents();
    } catch (error: any) {
      console.error('Erro ao reenviar convite:', error);
      toast({
        title: "Erro ao reenviar convite",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    }
  };

  return <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <UpgradeBanner />
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Gestão de Alunos</h1>
          <p className="text-muted-foreground">
            Gerencie seus alunos cadastrados
          </p>
        </div>

        {/* Alerts stacked vertically below title */}
        <div className="space-y-4">
          {currentPlan && (() => {
          const {
            isOverLimit,
            additionalCost,
            message
          } = getStudentOverageInfo(students.length);
          if (isOverLimit && currentPlan.slug !== 'free') {
            return <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                        Limite de Alunos Atingido
                      </h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Você está com {students.length} alunos de {currentPlan?.student_limit ?? 0} incluídos no seu plano atual.
                      </p>
                    </div>
                  </div>
                </div>;
          }
          if (currentPlan.slug === 'free' && students.length >= (currentPlan?.student_limit ?? 0) - 1) {
            return <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                        Plano Gratuito
                      </h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Você está usando {students.length} de {currentPlan?.student_limit ?? 0} alunos do plano gratuito.
                      </p>
                    </div>
                  </div>
                </div>;
          }
          return null;
        })()}
          
          {hasFeature('financial_module') && studentsWithoutBusinessProfile.length > 0 && <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-orange-800 dark:text-orange-200 mb-1">
                    Configuração de Pagamento Pendente
                  </h4>
                  <p className="text-sm text-orange-700 dark:text-orange-400 mb-0">
                    <strong>{studentsWithoutBusinessProfile.length}</strong> aluno(s) sem negócio de recebimento configurado. 
                    Configure para permitir faturamento e cobrança.
                  </p>
                  
                </div>
              </div>
            </div>}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          {hasFeature('financial_module') && students.filter(s => s.business_profile_id).length > 0 && <CreateInvoiceModal students={students.filter(s => s.business_profile_id).map(s => ({
          id: s.id,
          name: s.name,
          email: s.email
        }))} />}
          <FeatureGate studentCount={students.length} showUpgrade={true}>
            <Button onClick={() => setIsAddDialogOpen(true)} className="bg-gradient-primary shadow-primary hover:bg-primary-hover">
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
            {loading ? <div className="text-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
                <p className="text-muted-foreground">Carregando alunos...</p>
              </div> : students.length === 0 ? <div className="text-center py-8">
                <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Nenhum aluno cadastrado</h3>
                <p className="text-muted-foreground mb-4">
                  Comece adicionando seu primeiro aluno
                </p>
                <FeatureGate studentCount={students.length} showUpgrade={true}>
                  <Button onClick={() => setIsAddDialogOpen(true)} className="bg-gradient-primary shadow-primary">
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Primeiro Aluno
                  </Button>
                </FeatureGate>
              </div> : <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Responsável</TableHead>
                    {hasFeature('financial_module') && (
                      <>
                        <TableHead>Negócio Recebimento</TableHead>
                        <TableHead>Dia Cobrança</TableHead>
                      </>
                    )}
                    <TableHead>Data de Cadastro</TableHead>
                    <TableHead className="w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map(student => <TableRow key={student.id}>
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
                          {student.guardian_name ? <>
                              {student.guardian_name === student.name ? <Badge variant="outline" className="text-xs">
                                  <UserCheck className="h-3 w-3 mr-1" />
                                  Próprio aluno
                                </Badge> : <div>
                                  <p className="text-sm font-medium">{student.guardian_name}</p>
                                  <p className="text-xs text-muted-foreground">{student.guardian_email}</p>
                                </div>}
                            </> : <Badge variant="secondary" className="text-xs">
                              Não configurado
                            </Badge>}
                        </div>
                      </TableCell>
                      {hasFeature('financial_module') && (
                        <>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {student.business_profile_id ? <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                  Configurado
                                </Badge> : <Badge variant="destructive" className="text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Não configurado
                                </Badge>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{student.billing_day || 15}</span>
                            </div>
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        {new Date(student.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/alunos/${student.id}`)} title="Ver perfil completo">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleEditStudent(student)} title="Editar aluno">
                            <Edit className="h-4 w-4" />
                          </Button>
                          {!student.email_confirmed && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleResendInvitation(student)} 
                              title="Reenviar convite de confirmação"
                              className="hover:bg-blue-50 dark:hover:bg-blue-950"
                            >
                              <RefreshCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="hover:bg-destructive hover:text-destructive-foreground" onClick={() => handleConfirmSmartDelete(student)} title="Remover aluno">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>)}
                </TableBody>
              </Table>}
          </CardContent>
        </Card>

        {/* Student Form Modals */}
        <StudentFormModal isOpen={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onSubmit={handleAddStudent} isSubmitting={submitting} currentStudentCount={students.length} title="Adicionar Novo Aluno" description="Insira os dados do aluno e configurações de cobrança" />

        <StudentFormModal isOpen={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} onSubmit={handleUpdateStudent} isSubmitting={submitting} currentStudentCount={students.length} student={editingStudent || undefined} title="Editar Aluno" description="Altere os dados do aluno e configurações de cobrança" />

        {/* Business Profile Warning Modal */}
        {warningStudent && <BusinessProfileWarningModal student={warningStudent} isOpen={warningModalOpen} onClose={() => setWarningModalOpen(false)} onEditStudent={student => {
        const full = students.find(st => st.id === student.id);
        if (full) {
          setEditingStudent(full);
        } else {
          setEditingStudent({
            id: student.id,
            name: student.name,
            email: student.email,
            created_at: new Date().toISOString()
          } as Student);
        }
        setIsEditDialogOpen(true);
      }} action={warningAction} />}
      </div>
    </Layout>;
}
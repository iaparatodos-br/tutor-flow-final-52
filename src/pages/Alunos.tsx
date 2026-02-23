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

import { BusinessProfileWarningModal } from "@/components/BusinessProfileWarningModal";
import { UpdatePaymentMethodModal } from "@/components/UpdatePaymentMethodModal";
import { StudentImportDialog } from "@/components/students/StudentImportDialog";
import { DependentFormModal } from "@/components/DependentFormModal";
import { Plus, Edit, Trash2, Mail, User, Calendar, UserCheck, Eye, AlertTriangle, DollarSign, RefreshCcw, ChevronDown, ChevronRight, Users, UserPlus, Baby } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { FeatureGate } from "@/components/FeatureGate";
import { useTranslation } from "react-i18next";
import { useDependents, Dependent } from "@/hooks/useDependents";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle } from
"@/components/ui/alert-dialog";

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
  const { t } = useTranslation(['students', 'common']);
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
  const [paymentErrorModalOpen, setPaymentErrorModalOpen] = useState(false);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState("");
  const [pendingStudentData, setPendingStudentData] = useState<any>(null);

  // Dependent management state
  const [expandedResponsibles, setExpandedResponsibles] = useState<Set<string>>(new Set());
  const [isDependentModalOpen, setIsDependentModalOpen] = useState(false);
  const [editingDependent, setEditingDependent] = useState<Dependent | null>(null);
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Use the dependents hook
  const {
    dependents,
    isLoading: dependentsLoading,
    fetchDependents,
    createDependent,
    updateDependent,
    deleteDependent,
    getStudentAndDependentCount
  } = useDependents({ teacherId: profile?.id });

  // Load students and dependents on profile change
  useEffect(() => {
    if (profile?.id) {
      loadStudents();
      fetchDependents();
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
        title: t('messages.loadError'),
        description: t('messages.loadErrorDescription'),
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

      // For all registrations, guardian info = student info (simplified flow)
      const {
        data,
        error
      } = await supabase.functions.invoke('create-student', {
        body: {
          name: formData.name,
          email: formData.email,
          teacher_id: profile.id,
          redirect_url: redirectUrl,
          // Guardian data always mirrors student data (adult students are their own responsible)
          guardian_name: formData.name,
          guardian_email: formData.email,
          guardian_phone: formData.phone || null,
          guardian_cpf: null,
          guardian_address_street: null,
          guardian_address_city: null,
          guardian_address_state: null,
          guardian_address_postal_code: null,
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
          title: t('common:messages.error'),
          description: t('messages.emailInUse'),
          variant: 'destructive'
        });
        return;
      }

      // Check if the function returned success: false
      if (data && !data.success) {
        console.log('Function returned success: false, error:', data.error);

        // Check if it's a payment failure
        if (data.payment_failed) {
          console.log('Payment failed - showing payment update modal');
          setPaymentErrorMessage(data.error);
          setPendingStudentData(formData);
          setPaymentErrorModalOpen(true);
          return;
        }

        toast({
          title: 'Erro ao cadastrar aluno',
          description: data.error || 'Este e-mail já está sendo utilizado por outro aluno ou professor',
          variant: 'destructive'
        });
        return;
      }

      // Check if this is a family registration
      const isFamily = formData.registrationType === 'family';

      // If this is a family registration, create the dependents
      if (isFamily && formData.dependents && formData.dependents.length > 0 && data?.user_id) {
        console.log('Creating dependents for family registration...');
        const dependentErrors: string[] = [];

        for (const dep of formData.dependents) {
          try {
            const { data: depData, error: depError } = await supabase.functions.invoke('create-dependent', {
              body: {
                responsible_id: data.user_id,
                teacher_id: profile.id,
                name: dep.name,
                birth_date: dep.birth_date || null,
                notes: null
              }
            });

            if (depError || depData && depData.error) {
              console.error('Error creating dependent:', dep.name, depError || depData?.error);
              dependentErrors.push(dep.name);
            }
          } catch (depErr) {
            console.error('Exception creating dependent:', dep.name, depErr);
            dependentErrors.push(dep.name);
          }
        }

        if (dependentErrors.length > 0) {
          toast({
            title: t('dependents.errors.partialCreation', 'Alguns dependentes não foram criados'),
            description: t('dependents.errors.partialCreationDescription', 'Não foi possível criar: {{names}}', { names: dependentErrors.join(', ') }),
            variant: 'destructive'
          });
        }
      }

      // Success case - check if there's billing info or warning in the response
      let successMessage = data?.is_new_student ?
      `${formData.name} receberá um e-mail para concluir o cadastro.` :
      `${formData.name} foi vinculado à sua conta.`;

      if (isFamily && formData.dependents?.length > 0) {
        successMessage += ` ${formData.dependents.length} dependente(s) adicionado(s).`;
      }

      if (data?.billing_warning) {
        successMessage += ` ⚠️ ${data.billing_warning}`;
      } else if (data?.billing?.message) {
        successMessage += ` ${data.billing.message}`;
      }

      toast({
        title: isFamily ? 'Família cadastrada com sucesso!' : 'Aluno convidado com sucesso!',
        description: successMessage,
        duration: data?.billing_warning || data?.billing ? 5000 : 3000
      });
      setIsAddDialogOpen(false);
      loadStudents();
      fetchDependents(); // Atualizar lista de dependentes após cadastro de família
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
      // Use the update-student-details function - guardian data always mirrors student data
      const {
        data,
        error
      } = await supabase.functions.invoke('update-student-details', {
        body: {
          student_id: editingStudent.id,
          teacher_id: profile.id,
          relationship_id: editingStudent.relationship_id,
          student_name: formData.name,
          // Guardian data always mirrors student data (simplified flow)
          guardian_name: formData.name,
          guardian_email: formData.email,
          guardian_phone: formData.phone || null,
          guardian_cpf: null,
          guardian_address_street: null,
          guardian_address_city: null,
          guardian_address_state: null,
          guardian_address_postal_code: null,
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
        title: t('common:messages.error'),
        description: t('messages.relationshipNotFound'),
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

      // Handle HTTP errors (status 400, 500, etc.)
      if (error) {
        console.error('Smart delete error:', error);

        // Try to extract error details from the response
        let errorMessage = "Erro ao processar a remoção do aluno";

        try {
          // For FunctionsHttpError, the context contains the response
          if (error.context && typeof error.context.json === 'function') {
            const errorBody = await error.context.json();
            if (errorBody?.error) {
              errorMessage = errorBody.error;
            }
          }
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
        }

        toast({
          title: "Não foi possível remover",
          description: errorMessage,
          variant: "destructive"
        });
        return;
      }

      // Handle business logic errors (success: false)
      if (data && !data.success) {
        toast({
          title: "Não foi possível remover",
          description: data.error || "Erro ao processar a remoção do aluno",
          variant: "destructive"
        });
        return;
      }

      // Success - show appropriate message based on action
      const dependentsDeleted = data?.dependents_deleted || 0;
      const successMessage = dependentsDeleted > 0 ?
      `${student.name} e ${dependentsDeleted} dependente(s) foram removidos.` :
      `${student.name} perdeu acesso à sua área da plataforma.`;

      toast({
        title: data?.action === 'deleted' ? "Aluno excluído" : "Aluno desvinculado",
        description: successMessage
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
  const handleConfirmSmartDelete = (student: Student) => {
    setStudentToDelete(student);
    setDeleteDialogOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (!studentToDelete) return;

    setDeleting(true);
    try {
      await handleSmartDelete(studentToDelete);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setStudentToDelete(null);
    }
  };

  const getDependentsCountForDelete = () => {
    if (!studentToDelete) return 0;
    return getDependentsForStudent(studentToDelete.id).length;
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
  const studentsWithoutBusinessProfile = students.filter((s) => !s.business_profile_id);

  const handleResendInvitation = async (student: Student) => {
    if (!student.relationship_id) {
      toast({
        title: t('common:messages.error'),
        description: t('messages.relationshipNotFound'),
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

      if (error || data && !data.success) {
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

  // Helper to get dependents for a specific responsible
  const getDependentsForStudent = (studentId: string) => {
    return dependents.filter((d) => d.responsible_id === studentId);
  };

  // Toggle expansion of a responsible row
  const toggleExpanded = (studentId: string) => {
    setExpandedResponsibles((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  // Open modal to add dependent (with plan limit validation)
  const handleAddDependent = (responsibleId: string) => {
    // Check if user has reached the plan limit (for free plan)
    if (currentPlan?.slug === 'free') {
      const { isOverLimit } = getStudentOverageInfo(totalCount);
      if (isOverLimit) {
        toast({
          title: t('dependents.errors.limitReached', 'Limite atingido'),
          description: t('dependents.errors.limitReachedDescription', 'Você atingiu o limite de alunos/dependentes do plano gratuito. Faça upgrade para adicionar mais.'),
          variant: 'destructive'
        });
        return;
      }
    }

    setSelectedResponsibleId(responsibleId);
    setEditingDependent(null);
    setIsDependentModalOpen(true);
  };

  // Open modal to edit dependent
  const handleEditDependent = (dependent: Dependent) => {
    setSelectedResponsibleId(dependent.responsible_id);
    setEditingDependent(dependent);
    setIsDependentModalOpen(true);
  };

  // Handle dependent form submission
  const handleDependentSubmit = async (formData: {name: string;birth_date?: string;notes?: string;}) => {
    if (!selectedResponsibleId || !profile?.id) return;

    try {
      if (editingDependent) {
        await updateDependent(editingDependent.dependent_id, formData);
        toast({
          title: t('dependents.success.updated', 'Dependente atualizado'),
          description: t('dependents.success.updatedDescription', 'As informações foram salvas com sucesso.')
        });
      } else {
        await createDependent(formData, selectedResponsibleId, profile.id);
        toast({
          title: t('dependents.success.created', 'Dependente adicionado'),
          description: t('dependents.success.createdDescription', '{{name}} foi adicionado com sucesso.', { name: formData.name })
        });
      }
      setIsDependentModalOpen(false);
      setEditingDependent(null);
      fetchDependents();
    } catch (error: any) {
      toast({
        title: t('common:messages.error'),
        description: error.message || t('dependents.errors.saveFailed', 'Erro ao salvar dependente'),
        variant: "destructive"
      });
    }
  };

  // Handle dependent deletion
  const handleDeleteDependent = async (dependent: Dependent) => {
    const confirmMessage = t('dependents.confirmDelete', 'Tem certeza que deseja remover {{name}}?', { name: dependent.dependent_name });
    if (!confirm(confirmMessage)) return;

    try {
      await deleteDependent(dependent.dependent_id);
      toast({
        title: t('dependents.success.deleted', 'Dependente removido'),
        description: t('dependents.success.deletedDescription', '{{name}} foi removido com sucesso.', { name: dependent.dependent_name })
      });
      fetchDependents();
    } catch (error: any) {
      toast({
        title: t('common:messages.error'),
        description: error.message || t('dependents.errors.deleteFailed', 'Erro ao remover dependente'),
        variant: "destructive"
      });
    }
  };

  // Calculate total count (students + dependents) for plan limits
  const totalCount = students.length + dependents.length;

  return <Layout>
    <div className="max-w-6xl mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-6">
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
          } = getStudentOverageInfo(totalCount);
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
                    Você está com {totalCount} alunos/dependentes de {currentPlan?.student_limit ?? 0} incluídos no seu plano atual.
                  </p>
                </div>
              </div>
            </div>;
          }
          if (currentPlan.slug === 'free' && totalCount >= (currentPlan?.student_limit ?? 0) - 1) {
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
                    Você está usando {totalCount} de {currentPlan?.student_limit ?? 0} alunos/dependentes do plano gratuito.
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
        <StudentImportDialog onSuccess={loadStudents} currentStudentCount={totalCount} />

        <FeatureGate studentCount={totalCount} showUpgrade={true}>
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
            Lista de Alunos ({totalCount})
            {dependents.length > 0 &&
            <Badge variant="secondary" className="ml-2 text-xs">
                {students.length} alunos + {dependents.length} dependentes
              </Badge>
            }
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
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>{t('table.name', 'Nome')}</TableHead>
                <TableHead>{t('table.email', 'E-mail')}</TableHead>
                {hasFeature('financial_module') &&
                <>
                    <TableHead>{t('table.businessProfile', 'Negócio Recebimento')}</TableHead>
                    <TableHead>{t('table.billingDay', 'Dia Cobrança')}</TableHead>
                  </>
                }
                <TableHead className="w-[140px]">{t('table.actions', 'Ações')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => {
                const studentDependents = getDependentsForStudent(student.id);
                const hasDependents = studentDependents.length > 0;
                const isExpanded = expandedResponsibles.has(student.id);

                return (
                  <>
                    {/* Student/Responsible Row */}
                    <TableRow key={student.id} className={hasDependents ? 'cursor-pointer hover:bg-muted/50' : ''}>
                      <TableCell className="w-[40px] px-2">
                        {hasDependents ?
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleExpanded(student.id)}>

                            {isExpanded ?
                          <ChevronDown className="h-4 w-4" /> :

                          <ChevronRight className="h-4 w-4" />
                          }
                          </Button> :
                        null}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
                            {hasDependents ?
                            <Users className="h-4 w-4 text-primary" /> :

                            <User className="h-4 w-4 text-primary" />
                            }
                          </div>
                          <span>{student.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-4 w-4" />
                          {student.email}
                        </div>
                      </TableCell>
                      {hasFeature('financial_module') &&
                      <>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {student.business_profile_id ?
                            <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                  {t('status.configured', 'Configurado')}
                                </Badge> :

                            <Badge variant="destructive" className="text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {t('status.notConfigured', 'Não configurado')}
                                </Badge>
                            }
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{student.billing_day || 15}</span>
                            </div>
                          </TableCell>
                        </>
                      }
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/alunos/${student.id}`)} title={t('actions.viewProfile', 'Ver perfil')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleEditStudent(student)} title={t('actions.edit', 'Editar')}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          








                          {!student.email_confirmed &&
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResendInvitation(student)}
                            title={t('actions.resendInvitation', 'Reenviar convite')}
                            className="hover:bg-blue-50 dark:hover:bg-blue-950">

                              <RefreshCcw className="h-4 w-4" />
                            </Button>
                          }
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => handleConfirmSmartDelete(student)}
                            title={t('actions.remove', 'Remover')}>

                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Dependent Sub-Rows */}
                    {isExpanded && studentDependents.map((dep) =>
                    <TableRow key={dep.dependent_id} className="bg-muted/30">
                        <TableCell className="w-[40px] px-2"></TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 pl-6">
                            <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center">
                              <User className="h-3.5 w-3.5 text-secondary-foreground" />
                            </div>
                            <span className="text-sm">{dep.dependent_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="dependent" className="text-xs cursor-help">
                                  <Baby className="h-3 w-3 mr-1" />
                                  {t('badges.dependent', 'Dependente')}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  {t('dependents.billedToResponsible', 'Cobra via responsável')}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground text-sm">—</span>
                        </TableCell>
                        {hasFeature('financial_module') &&
                      <>
                            <TableCell>
                              <span className="text-muted-foreground text-xs italic">
                                {t('dependents.billedToResponsible', 'Cobra via responsável')}
                              </span>
                            </TableCell>
                            <TableCell>—</TableCell>
                          </>
                      }
                        <TableCell>
                          {dep.created_at ? new Date(dep.created_at).toLocaleDateString('pt-BR') : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditDependent(dep)}
                            title={t('actions.edit', 'Editar')}>

                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => handleDeleteDependent(dep)}
                            title={t('actions.remove', 'Remover')}>

                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}

                    {/* Add Dependent Row (when expanded and has dependents) */}
                    {isExpanded && hasDependents &&
                    <TableRow key={`${student.id}-add`} className="bg-muted/20">
                        <TableCell colSpan={hasFeature('financial_module') ? 8 : 6}>
                          <div className="flex items-center pl-8">
                            {currentPlan?.slug === 'free' && getStudentOverageInfo(totalCount).isOverLimit ?
                          <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled
                                  className="text-muted-foreground cursor-not-allowed">

                                      <Plus className="h-4 w-4 mr-2" />
                                      {t('dependents.addAnother', 'Adicionar mais um dependente')}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('dependents.errors.upgradeToPlan', 'Limite atingido. Faça upgrade para adicionar mais.')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider> :

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddDependent(student.id)}
                            className="text-primary hover:text-primary-foreground hover:bg-primary">

                                <Plus className="h-4 w-4 mr-2" />
                                {t('dependents.addAnother', 'Adicionar mais um dependente')}
                              </Button>
                          }
                          </div>
                        </TableCell>
                      </TableRow>
                    }
                  </>);

              })}
            </TableBody>
          </Table>}
        </CardContent>
      </Card>

      {/* Student Form Modals */}
      <StudentFormModal isOpen={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onSubmit={handleAddStudent} isSubmitting={submitting} currentStudentCount={totalCount} title="Adicionar Novo Aluno" description="Insira os dados do aluno e configurações de cobrança" />

      <StudentFormModal isOpen={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} onSubmit={handleUpdateStudent} isSubmitting={submitting} currentStudentCount={totalCount} student={editingStudent || undefined} title="Editar Aluno" description="Altere os dados do aluno e configurações de cobrança" />

      {/* Dependent Form Modal */}
      <DependentFormModal
        isOpen={isDependentModalOpen}
        onOpenChange={setIsDependentModalOpen}
        onSubmit={handleDependentSubmit}
        dependent={editingDependent}
        responsibleName={
        editingDependent ?
        editingDependent.responsible_name :
        students.find((s) => s.id === selectedResponsibleId)?.name
        } />


      {/* Business Profile Warning Modal */}
      {warningStudent && <BusinessProfileWarningModal student={warningStudent} isOpen={warningModalOpen} onClose={() => setWarningModalOpen(false)} onEditStudent={(student) => {
        const full = students.find((st) => st.id === student.id);
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

      {/* Update Payment Method Modal */}
      <UpdatePaymentMethodModal
        open={paymentErrorModalOpen}
        onOpenChange={setPaymentErrorModalOpen}
        errorMessage={paymentErrorMessage}
        onRetry={() => {
          if (pendingStudentData) {
            setIsAddDialogOpen(true);
          }
        }} />


      {/* Delete Student Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Tem certeza que deseja remover <strong>{studentToDelete?.name}</strong>?
              </p>
              {getDependentsCountForDelete() > 0 &&
              <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-destructive font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {getDependentsCountForDelete()} dependente(s) também será(ão) removido(s)
                  </p>
                </div>
              }
              <p className="text-muted-foreground mt-2">
                O aluno perderá acesso à sua área da plataforma. Esta ação não pode ser desfeita.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecuteDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">

              {deleting ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </Layout>;
}
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProfile } from "@/contexts/ProfileContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ClassReportView } from "@/components/ClassReportView";

import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  CreditCard, 
  GraduationCap,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Eye
} from "lucide-react";

interface StudentProfile {
  id: string;
  name: string;
  email: string;
  created_at: string;
  guardian_name?: string;
  guardian_email?: string;
  guardian_phone?: string;
  billing_day?: number;
}

interface ClassRecord {
  id: string;
  class_date: string;
  status: string;
  duration_minutes: number;
  notes?: string;
  cancellation_reason?: string;
  cancelled_at?: string;
  cancelled_by?: string;
}

interface Invoice {
  id: string;
  amount: number;
  due_date: string;
  status: string;
  description?: string;
  created_at: string;
  stripe_invoice_url?: string;
}

interface StudentStats {
  totalClasses: number;
  completedClasses: number;
  cancelledClasses: number;
  attendanceRate: number;
  totalPaid: number;
  pendingAmount: number;
}

export default function PerfilAluno() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { hasFeature } = useSubscription();
  const { toast } = useToast();

  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<StudentStats>({
    totalClasses: 0,
    completedClasses: 0,
    cancelledClasses: 0,
    attendanceRate: 0,
    totalPaid: 0,
    pendingAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedClassForReport, setSelectedClassForReport] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id && id) {
      loadStudentData();
    }
  }, [profile, id]);

  const loadStudentData = async () => {
    if (!profile?.id || !id) return;

    try {
      // Load student profile - first verify teacher-student relationship
      const { data: relationshipData, error: relationshipError } = await supabase
        .from('teacher_student_relationships')
        .select('student_id, student_guardian_name, student_guardian_email, student_guardian_phone, billing_day')
        .eq('teacher_id', profile.id)
        .eq('student_id', id)
        .single();

      if (relationshipError || !relationshipData) {
        throw new Error('Acesso negado: Este aluno não está vinculado ao seu perfil.');
      }

      // Now load the student basic data
      const { data: studentData, error: studentError } = await supabase
        .from('profiles')
        .select('id, name, email, created_at')
        .eq('id', id)
        .single();

      if (studentError) throw studentError;
      
      // Combine student data with guardian data from relationship
      const combinedStudent = {
        ...studentData,
        guardian_name: relationshipData.student_guardian_name,
        guardian_email: relationshipData.student_guardian_email,
        guardian_phone: relationshipData.student_guardian_phone,
        billing_day: relationshipData.billing_day
      };
      
      setStudent(combinedStudent);

      // Load student's class participations (both individual and group)
      const { data: participationsData, error: participationsError } = await supabase
        .from('class_participants')
        .select(`
          id,
          status,
          class_id,
          cancelled_at,
          charge_applied,
          cancellation_reason,
          classes!inner (
            id,
            class_date,
            duration_minutes,
            notes,
            teacher_id
          )
        `)
        .eq('student_id', id)
        .eq('classes.teacher_id', profile.id)
        .order('classes(class_date)', { ascending: false });

      if (participationsError) throw participationsError;

      // Transform to ClassRecord format
      const classesData = (participationsData || []).map(p => {
        const classData = Array.isArray(p.classes) ? p.classes[0] : p.classes;
        return {
          id: p.class_id,
          class_date: classData.class_date,
          status: p.status,
          duration_minutes: classData.duration_minutes,
          notes: classData.notes,
          cancellation_reason: p.cancellation_reason,
          cancelled_at: p.cancelled_at,
          cancelled_by: null
        };
      });

      setClasses(classesData);

      // Load invoices and calculate financial stats only if teacher has financial module
      let invoicesData: Invoice[] = [];
      let totalPaid = 0;
      let pendingAmount = 0;

      if (hasFeature('financial_module')) {
        const { data: fetchedInvoices, error: invoicesError } = await supabase
          .from('invoices')
          .select('*')
          .eq('student_id', id)
          .eq('teacher_id', profile.id)
          .order('created_at', { ascending: false });

        if (invoicesError) throw invoicesError;
        invoicesData = fetchedInvoices || [];
        setInvoices(invoicesData);

        // Calculate financial stats
        totalPaid = invoicesData.filter(i => i.status === 'paga').reduce((sum, i) => sum + Number(i.amount), 0);
        pendingAmount = invoicesData.filter(i => i.status === 'pendente').reduce((sum, i) => sum + Number(i.amount), 0);
      }

      // Calculate stats from participations
      const totalClasses = participationsData?.length || 0;
      const completedClasses = participationsData?.filter(p => p.status === 'concluida').length || 0;
      const cancelledClasses = participationsData?.filter(p => p.status === 'cancelada').length || 0;
      const attendanceRate = totalClasses > 0 ? (completedClasses / totalClasses) * 100 : 0;

      setStats({
        totalClasses,
        completedClasses,
        cancelledClasses,
        attendanceRate,
        totalPaid,
        pendingAmount,
      });

    } catch (error: any) {
      console.error('Erro ao carregar dados do aluno:', error);
      toast({
        title: "Erro ao carregar perfil",
        description: "Não foi possível carregar os dados do aluno",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'concluida': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'cancelada': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'pendente': return <Clock className="h-4 w-4 text-warning" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluida': return <Badge className="bg-success text-success-foreground">Concluída</Badge>;
      case 'cancelada': return <Badge variant="destructive">Cancelada</Badge>;
      case 'pendente': return <Badge className="bg-warning text-warning-foreground">Pendente</Badge>;
      case 'paga': return <Badge className="bg-success text-success-foreground">Paga</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!student) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto text-center py-12">
          <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">Aluno não encontrado</h2>
          <p className="text-muted-foreground mb-6">O aluno solicitado não foi encontrado ou você não tem permissão para visualizá-lo.</p>
          <Button onClick={() => navigate('/alunos')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para lista de alunos
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-4 sm:py-6 px-2 sm:px-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/alunos')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div className="h-8 border-l border-border"></div>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary-light flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">{student.name}</h1>
                <p className="text-muted-foreground">Perfil completo do aluno</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total de Aulas</p>
                  <p className="text-2xl font-bold">{stats.totalClasses}</p>
                </div>
                <GraduationCap className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Taxa de Presença</p>
                  <p className="text-2xl font-bold">{stats.attendanceRate.toFixed(1)}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-success" />
              </div>
            </CardContent>
          </Card>

          {hasFeature('financial_module') && (
            <Card className="shadow-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Pago</p>
                    <p className="text-2xl font-bold">R$ {stats.totalPaid.toFixed(2)}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
              </CardContent>
            </Card>
          )}

          {hasFeature('financial_module') && (
            <Card className="shadow-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Pendente</p>
                    <p className="text-2xl font-bold">R$ {stats.pendingAmount.toFixed(2)}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-warning" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student Info */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Dados Cadastrais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{student.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Cadastrado em {new Date(student.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Responsible Info */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Responsável
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {student.guardian_name ? (
                  <>
                    {student.guardian_name === student.name ? (
                      <div className="text-center py-4">
                        <Badge variant="outline" className="mb-2">
                          O próprio aluno é responsável
                        </Badge>
                        <p className="text-sm text-muted-foreground">
                          Cobrança direta para o aluno
                        </p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="font-medium">{student.guardian_name}</p>
                        </div>
                        {student.guardian_email && (
                          <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{student.guardian_email}</span>
                          </div>
                        )}
                        {student.guardian_phone && (
                          <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{student.guardian_phone}</span>
                          </div>
                        )}
                      </>
                    )}
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Dia de cobrança:</span>
                      <div className="flex items-center gap-1">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{student.billing_day || 15}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Dados do responsável não configurados
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          {/* History Sections */}
          <div className="lg:col-span-2 space-y-6">
            {/* Class History */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Histórico de Aulas ({classes.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {classes.length === 0 ? (
                  <div className="text-center py-8">
                    <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Nenhuma aula registrada ainda</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {classes.slice(0, 10).map((classRecord) => (
                      <div key={classRecord.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(classRecord.status)}
                          <div className="flex-1">
                            <p className="font-medium">
                              {new Date(classRecord.class_date).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {classRecord.duration_minutes} minutos
                            </p>
                            {classRecord.notes && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {classRecord.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(classRecord.status)}
                          {classRecord.status === 'concluida' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedClassForReport(classRecord.id)}
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              Ver Relato
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {classes.length > 10 && (
                      <p className="text-center text-sm text-muted-foreground">
                        Mostrando 10 de {classes.length} aulas
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment History */}
            {hasFeature('financial_module') && (
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Histórico de Pagamentos ({invoices.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {invoices.length === 0 ? (
                    <div className="text-center py-8">
                      <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">Nenhuma fatura registrada ainda</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {invoices.slice(0, 10).map((invoice) => (
                        <div key={invoice.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                          <div>
                            <p className="font-medium">R$ {Number(invoice.amount).toFixed(2)}</p>
                            <p className="text-sm text-muted-foreground">
                              Vencimento: {new Date(invoice.due_date).toLocaleDateString('pt-BR')}
                            </p>
                            {invoice.description && (
                              <p className="text-sm text-muted-foreground">
                                {invoice.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(invoice.status)}
                            {invoice.stripe_invoice_url && (
                              <Button variant="ghost" size="sm" asChild>
                                <a href={invoice.stripe_invoice_url} target="_blank" rel="noopener noreferrer">
                                  Ver Fatura
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {invoices.length > 10 && (
                        <p className="text-center text-sm text-muted-foreground">
                          Mostrando 10 de {invoices.length} faturas
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Class Report Modal */}
      <Dialog open={!!selectedClassForReport} onOpenChange={() => setSelectedClassForReport(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Relato da Aula
            </DialogTitle>
          </DialogHeader>
          {selectedClassForReport && (
            <div className="mt-4">
              <ClassReportView
                classId={selectedClassForReport}
                showEditButton={false}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
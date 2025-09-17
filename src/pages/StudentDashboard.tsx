import { useEffect, useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { useTeacherContext } from "@/contexts/TeacherContext";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, Clock, AlertCircle, Calendar, BookOpen, User, Mail, Phone, GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TeacherPolicyData {
  id: string;
  name: string;
  email: string;
  policy_document_url: string | null;
  cancellation_policy: {
    hours_before_class: number;
    charge_percentage: number;
    allow_amnesty: boolean;
  } | null;
}

interface StudentStats {
  upcomingClasses: number;
  completedClasses: number;
  sharedMaterials: number;
}

interface UpcomingClass {
  id: string;
  class_date: string;
  duration_minutes: number;
  service_name: string;
  notes: string | null;
}

interface SharedMaterial {
  id: string;
  title: string;
  description: string | null;
  file_type: string;
  file_name: string;
}

export default function StudentDashboard() {
  const { profile, isAluno } = useProfile();
  const { selectedTeacherId } = useTeacherContext();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [teacherData, setTeacherData] = useState<TeacherPolicyData | null>(null);
  const [stats, setStats] = useState<StudentStats>({
    upcomingClasses: 0,
    completedClasses: 0,
    sharedMaterials: 0
  });
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [sharedMaterials, setSharedMaterials] = useState<SharedMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedTeacherId) {
      loadTeacherData();
    }
  }, [selectedTeacherId]);

  const loadTeacherData = async () => {
    if (!selectedTeacherId) return;

    setLoading(true);
    try {
      // Load teacher profile data
      const { data: teacherProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, email, policy_document_url')
        .eq('id', selectedTeacherId)
        .maybeSingle();

      if (profileError) {
        console.error('Erro ao buscar perfil do professor:', profileError);
        throw profileError;
      }

      if (!teacherProfile) {
        throw new Error('Professor não encontrado');
      }

      // Load teacher's cancellation policy
      const { data: policy, error: policyError } = await supabase
        .from('cancellation_policies')
        .select('hours_before_class, charge_percentage, allow_amnesty')
        .eq('teacher_id', selectedTeacherId)
        .eq('is_active', true)
        .maybeSingle();

      if (policyError && policyError.code !== 'PGRST116') {
        throw policyError;
      }

      console.log('Policy loaded in StudentDashboard:', policy);
      console.log('Teacher ID:', selectedTeacherId);

      setTeacherData({
        ...teacherProfile,
        cancellation_policy: policy
      });

      // Load student statistics
      await loadStudentStats();
      
      // Load upcoming classes
      await loadUpcomingClasses();
      
      // Load shared materials
      await loadSharedMaterials();
    } catch (error) {
      console.error('Erro ao carregar dados do professor:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as informações do professor.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStudentStats = async () => {
    if (!selectedTeacherId || !profile?.id) return;

    try {
      // Count upcoming classes
      const { count: upcomingCount } = await supabase
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', profile.id)
        .eq('teacher_id', selectedTeacherId)
        .gte('class_date', new Date().toISOString())
        .eq('status', 'confirmada');

      // Count completed classes
      const { count: completedCount } = await supabase
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', profile.id)
        .eq('teacher_id', selectedTeacherId)
        .lt('class_date', new Date().toISOString())
        .eq('status', 'confirmada');

      // Count shared materials
      const { count: materialsCount } = await supabase
        .from('material_access')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', profile.id)
        .filter('materials.teacher_id', 'eq', selectedTeacherId);

      setStats({
        upcomingClasses: upcomingCount || 0,
        completedClasses: completedCount || 0,
        sharedMaterials: materialsCount || 0
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas do aluno:', error);
    }
  };

  const loadUpcomingClasses = async () => {
    if (!selectedTeacherId || !profile?.id) return;

    try {
      const { data: classes } = await supabase
        .from('classes')
        .select(`
          id,
          class_date,
          duration_minutes,
          notes,
          class_services(name)
        `)
        .eq('student_id', profile.id)
        .eq('teacher_id', selectedTeacherId)
        .gte('class_date', new Date().toISOString())
        .eq('status', 'confirmada')
        .order('class_date', { ascending: true })
        .limit(3);

      if (classes) {
        setUpcomingClasses(classes.map(cls => ({
          ...cls,
          service_name: cls.class_services?.name || 'Aula'
        })));
      }
    } catch (error) {
      console.error('Erro ao carregar próximas aulas:', error);
    }
  };

  const loadSharedMaterials = async () => {
    if (!selectedTeacherId || !profile?.id) return;

    try {
      const { data: materials } = await supabase
        .from('material_access')
        .select(`
          materials(
            id,
            title,
            description,
            file_type,
            file_name
          )
        `)
        .eq('student_id', profile.id)
        .filter('materials.teacher_id', 'eq', selectedTeacherId)
        .limit(5);

      if (materials) {
        setSharedMaterials(materials
          .map(access => access.materials)
          .filter(Boolean)
        );
      }
    } catch (error) {
      console.error('Erro ao carregar materiais compartilhados:', error);
    }
  };

  const downloadPolicyDocument = async () => {
    if (!teacherData?.policy_document_url) return;

    try {
      const { data, error } = await supabase.storage
        .from('policies')
        .download(teacherData.policy_document_url);

      if (error) throw error;

      // Create download link
      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `politica-${teacherData.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Sucesso",
        description: "Download iniciado com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao baixar documento:', error);
      toast({
        title: "Erro",
        description: "Não foi possível baixar o documento.",
        variant: "destructive",
      });
    }
  };

  if (!isAluno) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Acesso Restrito</h1>
          <p className="text-muted-foreground">
            Esta página é exclusiva para alunos.
          </p>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!teacherData) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Nenhum Professor Selecionado</h1>
          <p className="text-muted-foreground">
            Por favor, selecione um professor no menu lateral.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Portal do Aluno</h1>
          <p className="text-muted-foreground text-lg">
            Bem-vindo, {profile?.name}! Aqui estão suas informações de aulas com {teacherData.name}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-card hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Próximas Aulas</CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.upcomingClasses}</div>
              <p className="text-xs text-muted-foreground">
                Aulas agendadas
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aulas Concluídas</CardTitle>
              <GraduationCap className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedClasses}</div>
              <p className="text-xs text-muted-foreground">
                Total de aulas realizadas
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Materiais Disponíveis</CardTitle>
              <BookOpen className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sharedMaterials}</div>
              <p className="text-xs text-muted-foreground">
                Compartilhados pelo professor
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upcoming Classes */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Próximas Aulas
              </CardTitle>
              <CardDescription>
                Suas aulas agendadas com {teacherData.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingClasses.length > 0 ? (
                <div className="space-y-3">
                  {upcomingClasses.map((cls) => (
                    <div key={cls.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{cls.service_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(cls.class_date), "dd 'de' MMMM, HH:mm", { locale: ptBR })}
                        </p>
                        {cls.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{cls.notes}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{cls.duration_minutes}min</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma aula agendada no momento</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Teacher Info */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações do Professor
              </CardTitle>
              <CardDescription>
                Dados de contato e informações
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary-light flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{teacherData.name}</p>
                  <p className="text-sm text-muted-foreground">Professor</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">{teacherData.email}</p>
              </div>
            </CardContent>
          </Card>

          {/* Shared Materials */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Materiais Compartilhados
              </CardTitle>
              <CardDescription>
                Materiais disponibilizados pelo professor
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sharedMaterials.length > 0 ? (
                <div className="space-y-3">
                  {sharedMaterials.map((material) => (
                    <div key={material.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <FileText className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <p className="font-medium">{material.title}</p>
                        {material.description && (
                          <p className="text-sm text-muted-foreground">{material.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{material.file_type.toUpperCase()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhum material compartilhado ainda</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cancellation Policy */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Política de Cancelamento
              </CardTitle>
              <CardDescription>
                Termos e condições para cancelamento de aulas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {teacherData.cancellation_policy ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p><strong>Política atual:</strong></p>
                      <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                        <li>
                          Cancelamentos com pelo menos{' '}
                          <strong>{teacherData.cancellation_policy.hours_before_class} horas</strong> de antecedência
                        </li>
                        <li>
                          Cancelamentos tardios: cobrança de{' '}
                          <strong>{teacherData.cancellation_policy.charge_percentage}%</strong>
                        </li>
                        <li>
                          Anistia {teacherData.cancellation_policy.allow_amnesty ? "permitida" : "não permitida"}
                        </li>
                        <li>Cancelamentos pelo professor são sempre gratuitos</li>
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    O professor ainda não configurou uma política específica.
                  </AlertDescription>
                </Alert>
              )}

              {teacherData.policy_document_url && (
                <div className="mt-4 pt-4 border-t">
                  <Button onClick={downloadPolicyDocument} size="sm" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Baixar Política Completa (PDF)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
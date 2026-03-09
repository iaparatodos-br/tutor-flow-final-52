import { useEffect, useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { useTeacherContext } from "@/contexts/TeacherContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, Clock, AlertCircle, Calendar, BookOpen, User, Mail, GraduationCap, Baby, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatInTimezone, startOfMonthTz, DEFAULT_TIMEZONE } from "@/utils/timezone";

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
  dependent_name?: string | null;
}

interface SharedMaterial {
  id: string;
  title: string;
  description: string | null;
  file_type: string;
  file_name: string;
}

interface Dependent {
  id: string;
  name: string;
  birth_date: string | null;
}

interface DependentData {
  dependent: Dependent;
  stats: StudentStats;
  upcomingClasses: UpcomingClass[];
  sharedMaterials: SharedMaterial[];
}

interface ActiveSubscription {
  id: string;
  subscription_name: string;
  teacher_name: string;
  price: number;
  classes_used: number;
  starts_at: string;
}

export default function StudentDashboard() {
  const { profile, isAluno } = useProfile();
  const { selectedTeacherId, loading: teacherLoading } = useTeacherContext();
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
  
  // Dependentes do responsável
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [dependentData, setDependentData] = useState<Record<string, DependentData>>({});
  const [activeTab, setActiveTab] = useState<string>("self");
  
  // Mensalidades ativas
  const [activeSubscription, setActiveSubscription] = useState<ActiveSubscription | null>(null);

  console.log('StudentDashboard: Component render', {
    profile: profile?.id,
    isAluno,
    selectedTeacherId,
    teacherLoading,
    loading,
    dependentsCount: dependents.length
  });

  useEffect(() => {
    console.log('StudentDashboard: useEffect triggered', { 
      selectedTeacherId, 
      hasSelectedTeacherId: !!selectedTeacherId,
      teacherLoading
    });
    
    // Aguardar o TeacherContext terminar de carregar antes de tentar buscar dados
    if (!teacherLoading && selectedTeacherId) {
      loadTeacherData();
    }
  }, [selectedTeacherId, teacherLoading]);

  const loadTeacherData = async () => {
    if (!selectedTeacherId) return;

    setLoading(true);
    try {
      console.log('StudentDashboard: Loading teacher data for ID:', selectedTeacherId);
      
      // Load teacher profile data
      const { data: teacherProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, email, policy_document_url')
        .eq('id', selectedTeacherId)
        .maybeSingle();

      console.log('StudentDashboard: Teacher profile query result:', {
        data: teacherProfile,
        error: profileError
      });

      if (profileError) {
        console.error('Erro ao buscar perfil do professor:', profileError);
        throw profileError;
      }

      if (!teacherProfile) {
        console.error('StudentDashboard: Teacher profile not found for ID:', selectedTeacherId);
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
        console.error('StudentDashboard: Policy query error:', policyError);
        throw policyError;
      }

      console.log('StudentDashboard: Policy loaded:', policy);

      setTeacherData({
        ...teacherProfile,
        cancellation_policy: policy
      });

      // Load student statistics (self)
      await loadStudentStats();
      
      // Load upcoming classes (self)
      await loadUpcomingClasses();
      
      // Load shared materials (self)
      await loadSharedMaterials();
      
      // Load dependents for this teacher
      await loadDependents();
      
      // Load active subscription for this teacher
      await loadActiveSubscription();
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

  const loadDependents = async () => {
    if (!selectedTeacherId || !profile?.id) return;

    console.log('StudentDashboard: Loading dependents for responsible:', profile.id);

    try {
      // Fetch dependents where the current user is the responsible
      const { data: deps, error } = await supabase
        .from('dependents')
        .select('id, name, birth_date')
        .eq('responsible_id', profile.id)
        .eq('teacher_id', selectedTeacherId)
        .order('name');

      if (error) {
        console.error('Error loading dependents:', error);
        return;
      }

      console.log('StudentDashboard: Dependents loaded:', deps);
      setDependents(deps || []);

      // Load data for each dependent
      if (deps && deps.length > 0) {
        const dependentDataMap: Record<string, DependentData> = {};
        
        for (const dep of deps) {
          const depStats = await loadDependentStats(dep.id);
          const depClasses = await loadDependentUpcomingClasses(dep.id);
          const depMaterials = await loadDependentSharedMaterials(dep.id);
          
          dependentDataMap[dep.id] = {
            dependent: dep,
            stats: depStats,
            upcomingClasses: depClasses,
            sharedMaterials: depMaterials
          };
        }
        
        setDependentData(dependentDataMap);
      }
    } catch (error) {
      console.error('Erro ao carregar dependentes:', error);
    }
  };

  const loadActiveSubscription = async () => {
    if (!selectedTeacherId || !profile?.id) return;

    try {
      // Find the relationship with this teacher
      const { data: relationship, error: relError } = await supabase
        .from('teacher_student_relationships')
        .select('id')
        .eq('student_id', profile.id)
        .eq('teacher_id', selectedTeacherId)
        .single();

      if (relError || !relationship) {
        console.log('No relationship found for subscription check');
        return;
      }

      // Check for active subscription
      const { data: subscription, error: subError } = await supabase
        .from('student_monthly_subscriptions')
        .select(`
          id,
          starts_at,
          subscription_id,
          monthly_subscriptions (
            id,
            name,
            price,
            teacher_id
          )
        `)
        .eq('relationship_id', relationship.id)
        .eq('is_active', true)
        .is('ends_at', null)
        .maybeSingle();

      if (subError) {
        console.error('Error loading subscription:', subError);
        return;
      }

      if (subscription && subscription.monthly_subscriptions) {
        const sub = subscription.monthly_subscriptions;
        
        // Get teacher name
        const { data: teacher } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', selectedTeacherId)
          .single();

        // Count classes used this month (simplified - would need proper billing cycle logic)
        const userTz = profile?.timezone || DEFAULT_TIMEZONE;
        const startOfMonth = startOfMonthTz(new Date(), userTz);

        const { count: classesUsed } = await supabase
          .from('class_participants')
          .select(`
            id,
            classes!inner (teacher_id, class_date, is_experimental)
          `, { count: 'exact', head: true })
          .eq('student_id', profile.id)
          .eq('classes.teacher_id', selectedTeacherId)
          .eq('classes.is_experimental', false)
          .gte('classes.class_date', subscription.starts_at)
          .in('status', ['concluida', 'confirmada', 'pendente']);

        setActiveSubscription({
          id: subscription.id,
          subscription_name: sub.name,
          teacher_name: teacher?.name || 'Professor',
          price: sub.price,
          classes_used: classesUsed || 0,
          starts_at: subscription.starts_at
        });
      } else {
        setActiveSubscription(null);
      }
    } catch (error) {
      console.error('Erro ao carregar mensalidade:', error);
    }
  };

  const loadDependentStats = async (dependentId: string): Promise<StudentStats> => {
    if (!selectedTeacherId) return { upcomingClasses: 0, completedClasses: 0, sharedMaterials: 0 };

    try {
      // Count upcoming classes for dependent
      const { count: upcomingCount } = await supabase
        .from('class_participants')
        .select(`
          id,
          classes!inner (teacher_id, class_date)
        `, { count: 'exact', head: true })
        .eq('dependent_id', dependentId)
        .eq('classes.teacher_id', selectedTeacherId)
        .gte('classes.class_date', new Date().toISOString())
        .in('status', ['pendente', 'confirmada']);

      // Count completed classes for dependent
      const { count: completedCount } = await supabase
        .from('class_participants')
        .select(`
          id,
          classes!inner (teacher_id)
        `, { count: 'exact', head: true })
        .eq('dependent_id', dependentId)
        .eq('classes.teacher_id', selectedTeacherId)
        .eq('status', 'concluida');

      // Count shared materials for dependent
      const { count: materialsCount } = await supabase
        .from('material_access')
        .select(`
          id,
          materials!inner(teacher_id)
        `, { count: 'exact', head: true })
        .eq('dependent_id', dependentId)
        .eq('materials.teacher_id', selectedTeacherId);

      return {
        upcomingClasses: upcomingCount || 0,
        completedClasses: completedCount || 0,
        sharedMaterials: materialsCount || 0
      };
    } catch (error) {
      console.error('Erro ao carregar estatísticas do dependente:', error);
      return { upcomingClasses: 0, completedClasses: 0, sharedMaterials: 0 };
    }
  };

  const loadDependentUpcomingClasses = async (dependentId: string): Promise<UpcomingClass[]> => {
    if (!selectedTeacherId) return [];

    try {
      const { data: participations } = await supabase
        .from('class_participants')
        .select(`
          id,
          classes!inner (
            id,
            class_date,
            duration_minutes,
            notes,
            teacher_id,
            class_services (name)
          )
        `)
        .eq('dependent_id', dependentId)
        .eq('classes.teacher_id', selectedTeacherId)
        .gte('classes.class_date', new Date().toISOString())
        .in('status', ['pendente', 'confirmada'])
        .order('classes(class_date)', { ascending: true })
        .limit(3);

      if (participations) {
        return participations.map(p => ({
          id: p.classes.id,
          class_date: p.classes.class_date,
          duration_minutes: p.classes.duration_minutes,
          notes: p.classes.notes,
          service_name: p.classes.class_services?.name || 'Aula'
        }));
      }
      return [];
    } catch (error) {
      console.error('Erro ao carregar aulas do dependente:', error);
      return [];
    }
  };

  const loadDependentSharedMaterials = async (dependentId: string): Promise<SharedMaterial[]> => {
    if (!selectedTeacherId) return [];

    try {
      const { data: materials } = await supabase
        .from('material_access')
        .select(`
          id,
          materials!inner(
            id,
            title,
            description,
            file_type,
            file_name,
            teacher_id
          )
        `)
        .eq('dependent_id', dependentId)
        .eq('materials.teacher_id', selectedTeacherId)
        .limit(5);

      if (materials) {
        return materials.map(access => access.materials).filter(Boolean);
      }
      return [];
    } catch (error) {
      console.error('Erro ao carregar materiais do dependente:', error);
      return [];
    }
  };

  const loadStudentStats = async () => {
    if (!selectedTeacherId || !profile?.id) return;
    
    console.log('StudentDashboard: loadStudentStats started', {
      selectedTeacherId,
      profileId: profile.id
    });

    try {
      // Count upcoming classes (via participations)
      const { count: upcomingCount, error: upcomingError } = await supabase
        .from('class_participants')
        .select(`
          id,
          classes!inner (
            teacher_id,
            class_date
          )
        `, { count: 'exact', head: true })
        .eq('student_id', profile.id)
        .eq('classes.teacher_id', selectedTeacherId)
        .gte('classes.class_date', new Date().toISOString())
        .in('status', ['pendente', 'confirmada']);
      
      console.log('StudentDashboard: Upcoming classes result', {
        count: upcomingCount,
        error: upcomingError
      });

      if (upcomingError) throw upcomingError;

      // Count completed classes (via participations)
      const { count: completedCount, error: completedError } = await supabase
        .from('class_participants')
        .select(`
          id,
          classes!inner (
            teacher_id
          )
        `, { count: 'exact', head: true })
        .eq('student_id', profile.id)
        .eq('classes.teacher_id', selectedTeacherId)
        .eq('status', 'concluida');
      
      console.log('StudentDashboard: Completed classes result', {
        count: completedCount,
        error: completedError
      });

      // Count shared materials - Fix the query to use proper join
      const materialsQuery = supabase
        .from('material_access')
        .select(`
          id,
          materials!inner(
            id,
            teacher_id
          )
        `, { count: 'exact', head: true })
        .eq('student_id', profile.id)
        .eq('materials.teacher_id', selectedTeacherId);
        
      console.log('StudentDashboard: About to execute shared materials query');
      const { count: materialsCount, error: materialsError } = await materialsQuery;
      
      console.log('StudentDashboard: Shared materials result', {
        count: materialsCount,
        error: materialsError
      });

      const finalStats = {
        upcomingClasses: upcomingCount || 0,
        completedClasses: completedCount || 0,
        sharedMaterials: materialsCount || 0
      };
      
      console.log('StudentDashboard: Final stats being set', finalStats);
      
      setStats(finalStats);
    } catch (error) {
      console.error('Erro ao carregar estatísticas do aluno:', error);
    }
  };

  const loadUpcomingClasses = async () => {
    if (!selectedTeacherId || !profile?.id) return;

    try {
      const { data: participations } = await supabase
        .from('class_participants')
        .select(`
          id,
          classes!inner (
            id,
            class_date,
            duration_minutes,
            notes,
            teacher_id,
            class_services (
              name
            )
          )
        `)
        .eq('student_id', profile.id)
        .eq('classes.teacher_id', selectedTeacherId)
        .gte('classes.class_date', new Date().toISOString())
        .in('status', ['pendente', 'confirmada'])
        .order('classes(class_date)', { ascending: true })
        .limit(3);

      if (participations) {
        setUpcomingClasses(participations.map(p => ({
          id: p.classes.id,
          class_date: p.classes.class_date,
          duration_minutes: p.classes.duration_minutes,
          notes: p.classes.notes,
          service_name: p.classes.class_services?.name || 'Aula'
        })));
      }
    } catch (error) {
      console.error('Erro ao carregar próximas aulas:', error);
    }
  };

  const loadSharedMaterials = async () => {
    if (!selectedTeacherId || !profile?.id) return;

    console.log('StudentDashboard: loadSharedMaterials started', {
      selectedTeacherId,
      profileId: profile.id
    });

    try {
      const { data: materials, error } = await supabase
        .from('material_access')
        .select(`
          id,
          materials!inner(
            id,
            title,
            description,
            file_type,
            file_name,
            teacher_id
          )
        `)
        .eq('student_id', profile.id)
        .eq('materials.teacher_id', selectedTeacherId)
        .limit(5);

      console.log('StudentDashboard: Shared materials query result', {
        data: materials,
        error,
        count: materials?.length || 0
      });

      if (error) {
        console.error('Error loading shared materials:', error);
        return;
      }

      if (materials) {
        const extractedMaterials = materials
          .map(access => access.materials)
          .filter(Boolean);
          
        console.log('StudentDashboard: Extracted materials', extractedMaterials);
        setSharedMaterials(extractedMaterials);
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
      a.download = `politica-${teacherData?.name?.replace(/\s+/g, '-').toLowerCase() || 'professor'}.pdf`;
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

  if (loading || teacherLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="ml-3 text-muted-foreground">
            {teacherLoading ? 'Carregando professores...' : 'Carregando dados...'}
          </p>
        </div>
      </Layout>
    );
  }

  if (!teacherLoading && !selectedTeacherId) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Nenhum Professor Encontrado</h1>
          <p className="text-muted-foreground mb-4">
            Você não possui nenhuma relação com professores ou ainda não foi adicionado como aluno por um professor.
          </p>
          <p className="text-sm text-muted-foreground">
            Entre em contato com seu professor para ser adicionado como aluno.
          </p>
        </div>
      </Layout>
    );
  }

  // Renderiza os cards de estatísticas
  const renderStatsCards = (statsData: StudentStats) => (
    <div className="grid gap-4 grid-cols-1 xs:grid-cols-2 md:grid-cols-3">
      <Card className="shadow-card hover:shadow-lg transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Próximas Aulas</CardTitle>
          <Calendar className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{statsData.upcomingClasses}</div>
          <p className="text-xs text-muted-foreground">Aulas agendadas</p>
        </CardContent>
      </Card>

      <Card className="shadow-card hover:shadow-lg transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Aulas Concluídas</CardTitle>
          <GraduationCap className="h-4 w-4 text-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{statsData.completedClasses}</div>
          <p className="text-xs text-muted-foreground">Total de aulas realizadas</p>
        </CardContent>
      </Card>

      <Card className="shadow-card hover:shadow-lg transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Materiais Disponíveis</CardTitle>
          <BookOpen className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{statsData.sharedMaterials}</div>
          <p className="text-xs text-muted-foreground">Compartilhados pelo professor</p>
        </CardContent>
      </Card>
    </div>
  );

  // Renderiza a lista de próximas aulas
  const renderUpcomingClasses = (classes: UpcomingClass[]) => (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Próximas Aulas
        </CardTitle>
        <CardDescription>
          Aulas agendadas com {teacherData?.name || 'seu professor'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {classes.length > 0 ? (
          <div className="space-y-3">
            {classes.map((cls) => (
              <div key={cls.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">{cls.service_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatInTimezone(cls.class_date, "dd 'de' MMMM, HH:mm", profile?.timezone || DEFAULT_TIMEZONE)}
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
  );

  // Renderiza a lista de materiais compartilhados
  const renderSharedMaterials = (materials: SharedMaterial[]) => (
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
        {materials.length > 0 ? (
          <div className="space-y-3">
            {materials.map((material) => (
              <div 
                key={material.id} 
                className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate("/meus-materiais")}
              >
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
  );

  // Renderiza a seção de informações do professor
  const renderTeacherInfo = () => (
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
            <p className="font-semibold">{teacherData?.name || 'Professor'}</p>
            <p className="text-sm text-muted-foreground">Professor</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm">{teacherData?.email || 'Email não disponível'}</p>
        </div>
      </CardContent>
    </Card>
  );

  // Renderiza a política de cancelamento
  const renderCancellationPolicy = () => (
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
        {teacherData?.cancellation_policy ? (
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

        {teacherData?.policy_document_url && (
          <div className="mt-4 pt-4 border-t">
            <Button onClick={downloadPolicyDocument} size="sm" className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Baixar Política Completa (PDF)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Renderiza o card de mensalidade ativa
  const renderActiveSubscriptionCard = () => {
    if (!activeSubscription) return null;

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value);
    };

    return (
      <Card className="shadow-card border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {t('monthlySubscriptions:studentView.title')}
          </CardTitle>
          <CardDescription>
            {t('monthlySubscriptions:studentView.currentPlan')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-lg">{activeSubscription.subscription_name}</h4>
              <p className="text-sm text-muted-foreground">
                {t('monthlySubscriptions:studentView.teacher')}: {activeSubscription.teacher_name}
              </p>
            </div>
            <Badge variant="default" className="text-lg px-3 py-1">
              {formatCurrency(activeSubscription.price)}
              <span className="text-xs font-normal ml-1">/mês</span>
            </Badge>
          </div>

          <div className="pt-2 border-t text-xs text-muted-foreground">
            {/* starts_at é date-only — split manual */}
            {t('monthlySubscriptions:studentView.since')} {activeSubscription.starts_at.split('-').reverse().join('/')}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Renderiza o conteúdo de uma tab (seja do usuário ou de um dependente)
  const renderTabContent = (
    statsData: StudentStats, 
    classesData: UpcomingClass[], 
    materialsData: SharedMaterial[],
    isDependent: boolean = false,
    dependentName?: string
  ) => (
    <div className="space-y-6">
      {isDependent && dependentName && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
          <Baby className="h-5 w-5 text-primary" />
          <span className="text-sm text-muted-foreground">
            Visualizando dados de <strong>{dependentName}</strong>
          </span>
        </div>
      )}
      
      {/* Card de mensalidade ativa (apenas para o próprio usuário) */}
      {!isDependent && renderActiveSubscriptionCard()}
      
      {renderStatsCards(statsData)}
      
      <div className="grid gap-6 lg:grid-cols-2">
        {renderUpcomingClasses(classesData)}
        {isDependent ? renderSharedMaterials(materialsData) : renderTeacherInfo()}
        {!isDependent && renderSharedMaterials(materialsData)}
        {!isDependent && renderCancellationPolicy()}
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Portal do Aluno</h1>
          <p className="text-muted-foreground text-lg">
            Bem-vindo, {profile?.name}! {teacherData ? `Aqui estão suas informações de aulas com ${teacherData.name}` : 'Carregando informações...'}
          </p>
          {dependents.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <Baby className="h-4 w-4 inline mr-1" />
              Você é responsável por {dependents.length} dependente{dependents.length > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Tabs para responsáveis com dependentes */}
        {dependents.length > 0 ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="self" className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                Meus Dados
              </TabsTrigger>
              {dependents.map((dep) => (
                <TabsTrigger key={dep.id} value={dep.id} className="flex items-center gap-1.5">
                  <Baby className="h-4 w-4" />
                  {dep.name}
                </TabsTrigger>
              ))}
            </TabsList>
            
            <TabsContent value="self" className="mt-6">
              {renderTabContent(stats, upcomingClasses, sharedMaterials, false)}
            </TabsContent>
            
            {dependents.map((dep) => (
              <TabsContent key={dep.id} value={dep.id} className="mt-6">
                {dependentData[dep.id] ? (
                  renderTabContent(
                    dependentData[dep.id].stats,
                    dependentData[dep.id].upcomingClasses,
                    dependentData[dep.id].sharedMaterials,
                    true,
                    dep.name
                  )
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <p className="ml-3 text-muted-foreground">Carregando dados...</p>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          // Sem dependentes - renderiza normalmente
          renderTabContent(stats, upcomingClasses, sharedMaterials, false)
        )}
      </div>
    </Layout>
  );
}
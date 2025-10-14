import { useEffect, useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, DollarSign, Clock, CreditCard, AlertCircle } from "lucide-react";
import { UpgradeBanner } from "@/components/UpgradeBanner";

interface DashboardStats {
  totalStudents: number;
  upcomingClasses: number;
  pendingInvoices: number;
  thisMonthRevenue: number;
}

export default function Dashboard() {
  const { profile, isProfessor, isAluno } = useProfile();
  const { loading: authLoading } = useAuth();
  const { hasFeature, hasTeacherFeature } = useSubscription();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    upcomingClasses: 0,
    pendingInvoices: 0,
    thisMonthRevenue: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && profile?.id) {
      if (isProfessor) {
        loadStats();
      } else {
        setLoading(false);
      }
    }
  }, [profile, isProfessor, authLoading]);

  const loadStats = async () => {
    if (!profile?.id) return;

    try {
      // Buscar total de alunos
      const { data: teacherStudents } = await supabase
        .rpc('get_teacher_students', { teacher_user_id: profile.id });
      const studentsCount = (teacherStudents || []).length;

      // Buscar aulas futuras
      const { count: classesCount } = await supabase
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', profile.id)
        .gte('class_date', new Date().toISOString());

      let invoicesCount = 0;
      let monthlyRevenue = 0;

      // Only load financial data if user has financial module
      const hasFinancialAccess = isProfessor ? hasFeature('financial_module') : hasTeacherFeature('financial_module');
      if (hasFinancialAccess) {
        // Buscar faturas pendentes
        const { count: pendingInvoicesCount } = await supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('teacher_id', profile.id)
          .eq('status', 'pendente');

        // Buscar receita do mês
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        
        const { data: paidInvoices } = await supabase
          .from('invoices')
          .select('amount')
          .eq('teacher_id', profile.id)
          .eq('status', 'paga')
          .gte('updated_at', startOfMonth.toISOString());

        invoicesCount = pendingInvoicesCount || 0;
        monthlyRevenue = paidInvoices?.reduce((sum, invoice) => sum + Number(invoice.amount), 0) || 0;
      }

      setStats({
        totalStudents: studentsCount || 0,
        upcomingClasses: classesCount || 0,
        pendingInvoices: invoicesCount,
        thisMonthRevenue: monthlyRevenue
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  // Show loading until we're sure of user role
  if (authLoading || !profile || (!isProfessor && !isAluno)) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto">
          <div className="text-center space-y-4">
            <div className="h-8 bg-muted/50 rounded animate-pulse mx-auto max-w-xs" />
            <div className="h-4 bg-muted/30 rounded animate-pulse mx-auto max-w-md" />
          </div>
        </div>
      </Layout>
    );
  }

  if (isAluno) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">{t('dashboard:studentPortal.title')}</h1>
            <p className="text-muted-foreground mb-6">
              {t('dashboard:studentPortal.description', { name: profile?.name })}
            </p>
            <div 
              className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg cursor-pointer transition-colors"
              onClick={() => navigate("/portal-do-aluno")}
            >
              <Calendar className="h-5 w-5 mr-2" />
              {t('dashboard:studentPortal.accessButton')}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <UpgradeBanner />
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">{t('dashboard:greeting', { name: profile?.name || 'Usuário' })}</h1>
          <p className="text-muted-foreground">
            {t('dashboard:summary')}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-card hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard:stats.totalStudents')}</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : stats.totalStudents}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard:stats.studentsRegistered')}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard:stats.upcomingClasses')}</CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : stats.upcomingClasses}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard:stats.classesScheduled')}
              </p>
            </CardContent>
          </Card>

          {(isProfessor ? hasFeature('financial_module') : hasTeacherFeature('financial_module')) && (
            <Card className="shadow-card hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('dashboard:stats.pendingPayments')}</CardTitle>
                <Clock className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loading ? "..." : stats.pendingInvoices}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard:stats.openInvoices')}
                </p>
              </CardContent>
            </Card>
          )}

          {(isProfessor ? hasFeature('financial_module') : hasTeacherFeature('financial_module')) && (
            <Card className="shadow-card hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('dashboard:stats.monthlyRevenue')}</CardTitle>
                <DollarSign className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loading ? "..." : `R$ ${stats.thisMonthRevenue.toFixed(2)}`}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard:stats.receivedAmount')}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Quick Actions */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>{t('dashboard:quickActions.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div 
                className="text-center p-4 rounded-lg bg-primary-light hover:bg-primary-hover cursor-pointer transition-colors"
                onClick={() => navigate("/alunos")}
              >
                <Users className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="font-medium">{t('dashboard:quickActions.manageStudents.title')}</p>
                <p className="text-sm text-muted-foreground">{t('dashboard:quickActions.manageStudents.description')}</p>
              </div>
              
              <div 
                className="text-center p-4 rounded-lg bg-primary-light hover:bg-primary-hover cursor-pointer transition-colors"
                onClick={() => navigate("/agenda")}
              >
                <Calendar className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="font-medium">{t('dashboard:quickActions.scheduleClass.title')}</p>
                <p className="text-sm text-muted-foreground">{t('dashboard:quickActions.scheduleClass.description')}</p>
              </div>
              
              {(isProfessor ? hasFeature('financial_module') : hasTeacherFeature('financial_module')) && (
                <div 
                  className="text-center p-4 rounded-lg bg-success-light hover:bg-success-hover cursor-pointer transition-colors"
                  onClick={() => navigate("/financeiro")}
                >
                  <DollarSign className="h-8 w-8 mx-auto mb-2 text-success" />
                  <p className="font-medium">{t('dashboard:quickActions.createInvoice.title')}</p>
                  <p className="text-sm text-muted-foreground">{t('dashboard:quickActions.createInvoice.description')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment Accounts Management */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>{t('dashboard:configuration')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {(isProfessor ? hasFeature('financial_module') : hasTeacherFeature('financial_module')) && (
                <div 
                  className="text-center p-4 rounded-lg bg-primary-light hover:bg-primary-hover cursor-pointer transition-colors"
                  onClick={() => navigate("/painel/configuracoes/negocios")}
                >
                  <CreditCard className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <p className="font-medium">{t('dashboard:quickActions.paymentAccounts.title')}</p>
                  <p className="text-sm text-muted-foreground">{t('dashboard:quickActions.paymentAccounts.description')}</p>
                </div>
              )}
              
              <div 
                className="text-center p-4 rounded-lg bg-success-light hover:bg-success-hover cursor-pointer transition-colors"
                onClick={() => navigate("/servicos")}
              >
                <DollarSign className="h-8 w-8 mx-auto mb-2 text-success" />
                <p className="font-medium">{t('dashboard:quickActions.manageServices.title')}</p>
                <p className="text-sm text-muted-foreground">{t('dashboard:quickActions.manageServices.description')}</p>
              </div>
              
              <div 
                className="text-center p-4 rounded-lg bg-muted hover:bg-muted/80 cursor-pointer transition-colors"
                onClick={() => navigate("/politicas-cancelamento")}
              >
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="font-medium">{t('dashboard:quickActions.policies.title')}</p>
                <p className="text-sm text-muted-foregoing">{t('dashboard:quickActions.policies.description')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
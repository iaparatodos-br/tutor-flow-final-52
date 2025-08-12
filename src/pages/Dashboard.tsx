import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, DollarSign, Clock } from "lucide-react";

interface DashboardStats {
  totalStudents: number;
  upcomingClasses: number;
  pendingInvoices: number;
  thisMonthRevenue: number;
}

export default function Dashboard() {
  const { profile, isProfessor } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    upcomingClasses: 0,
    pendingInvoices: 0,
    thisMonthRevenue: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id && isProfessor) {
      loadStats();
    } else {
      setLoading(false);
    }
  }, [profile, isProfessor]);

  const loadStats = async () => {
    if (!profile?.id) return;

    try {
      // Buscar total de alunos
      const { count: studentsCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', profile.id)
        .eq('role', 'aluno');

      // Buscar aulas futuras
      const { count: classesCount } = await supabase
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', profile.id)
        .gte('class_date', new Date().toISOString());

      // Buscar faturas pendentes
      const { count: invoicesCount } = await supabase
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

      const monthlyRevenue = paidInvoices?.reduce((sum, invoice) => sum + Number(invoice.amount), 0) || 0;

      setStats({
        totalStudents: studentsCount || 0,
        upcomingClasses: classesCount || 0,
        pendingInvoices: invoicesCount || 0,
        thisMonthRevenue: monthlyRevenue
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isProfessor) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">Portal do Aluno</h1>
            <p className="text-muted-foreground">
              Bem-vindo, {profile?.name}! Use o menu lateral para navegar pelas suas aulas e faturas.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Olá, {profile?.name}!</h1>
          <p className="text-muted-foreground">
            Aqui está um resumo das suas atividades
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-card hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Alunos</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : stats.totalStudents}
              </div>
              <p className="text-xs text-muted-foreground">
                Alunos cadastrados
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Próximas Aulas</CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : stats.upcomingClasses}
              </div>
              <p className="text-xs text-muted-foreground">
                Aulas agendadas
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pagamentos Pendentes</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : stats.pendingInvoices}
              </div>
              <p className="text-xs text-muted-foreground">
                Faturas em aberto
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita do Mês</CardTitle>
              <DollarSign className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : `R$ ${stats.thisMonthRevenue.toFixed(2)}`}
              </div>
              <p className="text-xs text-muted-foreground">
                Valor recebido
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div 
                className="text-center p-4 rounded-lg bg-primary-light hover:bg-primary-hover cursor-pointer transition-colors"
                onClick={() => navigate("/alunos")}
              >
                <Users className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="font-medium">Gerenciar Alunos</p>
                <p className="text-sm text-muted-foreground">Adicionar e editar alunos</p>
              </div>
              
              <div 
                className="text-center p-4 rounded-lg bg-primary-light hover:bg-primary-hover cursor-pointer transition-colors"
                onClick={() => navigate("/agenda")}
              >
                <Calendar className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="font-medium">Agendar Aula</p>
                <p className="text-sm text-muted-foreground">Marcar nova aula</p>
              </div>
              
              <div 
                className="text-center p-4 rounded-lg bg-success-light hover:bg-success cursor-pointer transition-colors"
                onClick={() => navigate("/financeiro")}
              >
                <DollarSign className="h-8 w-8 mx-auto mb-2 text-success" />
                <p className="font-medium">Nova Fatura</p>
                <p className="text-sm text-muted-foreground">Criar cobrança</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
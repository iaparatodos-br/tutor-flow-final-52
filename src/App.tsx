import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useEffect } from 'react';
import { supabase } from "./integrations/supabase/client";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { TeacherProvider } from "@/contexts/TeacherContext";
import { useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import ProfileSetupPage from "./pages/ProfileSetupPage";
import Dashboard from "./pages/Dashboard";
import Alunos from "./pages/Alunos";
import PerfilAluno from "./pages/PerfilAluno";
import Agenda from "./pages/Agenda";
import Financeiro from "./pages/Financeiro";
import Materiais from "./pages/Materiais";
import MeusMateriais from "./pages/MeusMateriais";
import ContasRecebimento from "./pages/ContasRecebimento";
import Servicos from "./pages/Servicos";
import Configuracoes from "./pages/Configuracoes";
import Planos from "./pages/Planos";
import Subscription from "./pages/Subscription";
import Historico from "./pages/Historico";
import NotFound from "./pages/NotFound";
import { FinancialRouteGuard } from "./components/FinancialRouteGuard";

const queryClient = new QueryClient();

const AppWithProviders = () => {
  const { loading, profile, isProfessor, isAluno, isAuthenticated, needsPasswordChange, needsAddressInfo } = useAuth();
  const navigate = useNavigate();
  
  // Orquestrador de navegação para recuperação de senha
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // A biblioteca Supabase já criou a sessão.
        // A única tarefa da nossa aplicação é garantir que o usuário esteja na página correta.
        navigate('/reset-password');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Função CORRIGIDA e centralizada para detectar o fluxo de recuperação de senha via HASH.
  const isPasswordRecoveryFlow = () => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    return hashParams.get('type') === 'recovery';
  };
  
  // Aguardar o carregamento, mas permitir a passagem imediata se for recuperação de senha
  // para evitar um piscar da tela de loading.
  if (loading && !isPasswordRecoveryFlow()) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-subtle">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Guarda de Rota: Forçar troca de senha, mas IGNORAR se estiver no fluxo de recuperação.
  if (isAuthenticated && needsPasswordChange && !isPasswordRecoveryFlow()) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<ForcePasswordChange />} />
      </Routes>
    );
  }

  // Guarda de Rota: Forçar preenchimento de endereço, mas IGNORAR se estiver no fluxo de recuperação.
  if (isAuthenticated && needsAddressInfo && !isPasswordRecoveryFlow()) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<ProfileSetupPage />} />
      </Routes>
    );
  }
  
  return (
    <ProfileProvider profile={profile} isProfessor={isProfessor} isAluno={isAluno}>
      <SubscriptionProvider>
        <SidebarProvider>
          <TeacherProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/alunos" element={<Alunos />} />
                <Route path="/alunos/:id" element={<PerfilAluno />} />
                <Route path="/agenda" element={<Agenda />} />
                <Route path="/aulas" element={<Agenda />} />
                <Route path="/financeiro" element={<FinancialRouteGuard><Financeiro /></FinancialRouteGuard>} />
                <Route path="/faturas" element={<FinancialRouteGuard><Financeiro /></FinancialRouteGuard>} />
                <Route path="/materiais" element={<Materiais />} />
                <Route path="/meus-materiais" element={<MeusMateriais />} />
                <Route path="/contas-recebimento" element={<FinancialRouteGuard><ContasRecebimento /></FinancialRouteGuard>} />
                <Route path="/servicos" element={<Servicos />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                <Route path="/politicas-cancelamento" element={<Configuracoes />} />
                <Route path="/historico" element={<Historico />} />
                <Route path="/planos" element={<Planos />} />
                <Route path="/subscription" element={<Subscription />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </TooltipProvider>
          </TeacherProvider>
        </SidebarProvider>
      </SubscriptionProvider>
    </ProfileProvider>
  );
};

const App = () => (
  <ThemeProvider
    attribute="class"
    defaultTheme="light"
    enableSystem
    disableTransitionOnChange
  >
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppWithProviders />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
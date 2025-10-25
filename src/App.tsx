import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { TeacherProvider } from "@/contexts/TeacherContext";
import { useAuth } from "@/contexts/AuthContext";
import { StudentSelectionBlocker } from "@/components/StudentSelectionBlocker";
import { PaymentFailureGuard } from "@/components/PaymentFailureGuard";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
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

import Servicos from "./pages/Servicos";
import Configuracoes from "./pages/Configuracoes";
import Planos from "./pages/Planos";
import Subscription from "./pages/Subscription";
import Historico from "./pages/Historico";
import StudentDashboard from "./pages/StudentDashboard";
import Faturas from "./pages/Faturas";
import Recibo from "./pages/Recibo";
import PainelNegocios from "./pages/PainelNegocios";
import Seguranca from "./pages/Seguranca";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import NotFound from "./pages/NotFound";
import { FinancialRouteGuard } from "./components/FinancialRouteGuard";

const queryClient = new QueryClient();

const AppWithProviders = () => {
  const { loading, profile, isProfessor, isAluno, isAuthenticated, needsPasswordChange, needsAddressInfo } = useAuth();
  
  // Aguardar o carregamento completo do auth e profile
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-subtle">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Check if we're on reset-password page with recovery tokens
  const isResetPasswordWithTokens = () => {
    const currentPath = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    return currentPath === '/reset-password' && 
           urlParams.get('access_token') && 
           urlParams.get('refresh_token') && 
           urlParams.get('type') === 'recovery';
  };

  // If authenticated but needs password change (but allow reset-password with tokens)
  if (isAuthenticated && needsPasswordChange && !isResetPasswordWithTokens()) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<ForcePasswordChange />} />
      </Routes>
    );
  }

  // If authenticated but needs address info (but allow reset-password with tokens)
  if (isAuthenticated && needsAddressInfo && !isResetPasswordWithTokens()) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<ProfileSetupPage />} />
      </Routes>
    );
  }
  
  return (
    <ProfileProvider profile={profile} isProfessor={isProfessor} isAluno={isAluno}>
      <TeacherProvider>
        <SubscriptionProvider>
          <SidebarProvider>
            <TooltipProvider>
              <StudentSelectionBlocker />
              <PaymentFailureGuard />
              <Toaster />
              <Sonner />
              <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/termos-de-uso" element={<TermsOfService />} />
            <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/alunos" element={<Alunos />} />
            <Route path="/alunos/:id" element={<PerfilAluno />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/aulas" element={<Agenda />} />
            <Route path="/financeiro" element={<FinancialRouteGuard><Financeiro /></FinancialRouteGuard>} />
            <Route path="/faturas" element={<FinancialRouteGuard><Faturas /></FinancialRouteGuard>} />
            <Route path="/recibo/:invoiceId" element={<FinancialRouteGuard><Recibo /></FinancialRouteGuard>} />
            <Route path="/materiais" element={<Materiais />} />
            <Route path="/meus-materiais" element={<MeusMateriais />} />
            
            <Route path="/servicos" element={<Servicos />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/painel/configuracoes/negocios" element={<FinancialRouteGuard><PainelNegocios /></FinancialRouteGuard>} />
            <Route path="/politicas-cancelamento" element={<Configuracoes />} />
            <Route path="/historico" element={<Historico />} />
            <Route path="/planos" element={<Planos />} />
            <Route path="/subscription" element={<Subscription />} />
            <Route path="/seguranca" element={<Seguranca />} />
            <Route path="/portal-do-aluno" element={<StudentDashboard />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
            </TooltipProvider>
          </SidebarProvider>
        </SubscriptionProvider>
      </TeacherProvider>
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
      <AuthProvider>
        <AppWithProviders />
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
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
import PoliticasCancelamento from "./pages/PoliticasCancelamento";
import Planos from "./pages/Planos";
import Subscription from "./pages/Subscription";
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

  // If authenticated but needs password change, show force password change
  if (isAuthenticated && needsPasswordChange) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<ForcePasswordChange />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // If authenticated but needs address info, show profile setup
  if (isAuthenticated && needsAddressInfo) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<ProfileSetupPage />} />
        </Routes>
      </BrowserRouter>
    );
  }
  
  return (
    <ProfileProvider profile={profile} isProfessor={isProfessor} isAluno={isAluno}>
      <SubscriptionProvider>
        <SidebarProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
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
            <Route path="/politicas-cancelamento" element={<PoliticasCancelamento />} />
            <Route path="/planos" element={<Planos />} />
            <Route path="/subscription" element={<Subscription />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrowserRouter>
          </TooltipProvider>
        </SidebarProvider>
      </SubscriptionProvider>
    </ProfileProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AppWithProviders />
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

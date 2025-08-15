import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Alunos from "./pages/Alunos";
import PerfilAluno from "./pages/PerfilAluno";
import Agenda from "./pages/Agenda";
import Financeiro from "./pages/Financeiro";
import PoliticasCancelamento from "./pages/PoliticasCancelamento";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/faturas" element={<Financeiro />} />
          <Route path="/politicas-cancelamento" element={<PoliticasCancelamento />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

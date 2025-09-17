import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from './contexts/AuthContext'
import { ProfileProvider } from './contexts/ProfileContext'
import { SubscriptionProvider } from './contexts/SubscriptionContext'
import { TeacherProvider } from './contexts/TeacherContext'

import Agenda from './pages/Agenda'
import Alunos from './pages/Alunos'
import Auth from './pages/Auth'
import Configuracoes from './pages/Configuracoes'
import ContasRecebimento from './pages/ContasRecebimento'
import Dashboard from './pages/Dashboard'
import Financeiro from './pages/Financeiro'
import ForcePasswordChange from './pages/ForcePasswordChange'
import Historico from './pages/Historico'
import Index from './pages/Index'
import Materiais from './pages/Materiais'
import MeusMateriais from './pages/MeusMateriais'
import NotFound from './pages/NotFound'
import PerfilAluno from './pages/PerfilAluno'
import Planos from './pages/Planos'
import ProfileSetupPage from './pages/ProfileSetupPage'
import ResetPassword from './pages/ResetPassword'
import Servicos from './pages/Servicos'
import Subscription from './pages/Subscription'

import Layout from './components/Layout'
import { useEffect } from 'react'
import { supabase } from './integrations/supabase/client'
import { useNavigate } from 'react-router-dom'

const queryClient = new QueryClient()

function App() {
  const navigate = useNavigate()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [navigate])

  return (
    <ProfileProvider>
      <SubscriptionProvider>
        <TeacherProvider>
          <Toaster />
          <Routes>
            {/* Public Routes */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/force-password-change"
              element={<ForcePasswordChange />}
            />

            {/* Private Routes */}
            <Route
              path="/"
              element={
                <Layout>
                  <Index />
                </Layout>
              }
            />
            <Route
              path="/dashboard"
              element={
                <Layout>
                  <Dashboard />
                </Layout>
              }
            />
            <Route
              path="/agenda"
              element={
                <Layout>
                  <Agenda />
                </Layout>
              }
            />
            <Route
              path="/alunos"
              element={
                <Layout>
                  <Alunos />
                </Layout>
              }
            />
            <Route
              path="/alunos/:id"
              element={
                <Layout>
                  <PerfilAluno />
                </Layout>
              }
            />
            <Route
              path="/financeiro"
              element={
                <Layout>
                  <Financeiro />
                </Layout>
              }
            />
            <Route
              path="/materiais"
              element={
                <Layout>
                  <Materiais />
                </Layout>
              }
            />
            <Route
              path="/meus-materiais"
              element={
                <Layout>
                  <MeusMateriais />
                </Layout>
              }
            />
            <Route
              path="/configuracoes"
              element={
                <Layout>
                  <Configuracoes />
                </Layout>
              }
            />
            <Route
              path="/profile-setup"
              element={
                <Layout>
                  <ProfileSetupPage />
                </Layout>
              }
            />
            <Route
              path="/subscription"
              element={
                <Layout>
                  <Subscription />
                </Layout>
              }
            />
            <Route
              path="/planos"
              element={
                <Layout>
                  <Planos />
                </Layout>
              }
            />
            <Route
              path="/servicos"
              element={
                <Layout>
                  <Servicos />
                </Layout>
              }
            />
            <Route
              path="/contas-recebimento"
              element={
                <Layout>
                  <ContasRecebimento />
                </Layout>
              }
            />
            <Route
              path="/historico"
              element={
                <Layout>
                  <Historico />
                </Layout>
              }
            />

            {/* Not Found Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TeacherProvider>
      </SubscriptionProvider>
    </ProfileProvider>
  )
}

function AppWrapper() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default AppWrapper
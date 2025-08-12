import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, Calendar, DollarSign, ArrowRight } from "lucide-react";

const Index = () => {
  const { loading, isAuthenticated } = useAuth();

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

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-primary text-white shadow-primary">
              <GraduationCap className="h-10 w-10" />
            </div>
          </div>
          
          <h1 className="text-5xl font-bold mb-6">
            Bem-vindo ao{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              TutorFlow
            </span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            A plataforma completa para professores particulares gerenciarem 
            seus alunos, agenda e faturamento de forma simples e eficiente.
          </p>
          
          <div className="flex justify-center gap-4">
            <Button 
              size="lg" 
              asChild
              className="bg-gradient-primary shadow-primary hover:bg-primary-hover px-8"
            >
              <a href="/auth">
                Começar Agora
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              asChild
              className="px-8"
            >
              <a href="/auth">
                Fazer Login
              </a>
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="shadow-card hover:shadow-lg transition-all duration-300">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-lg bg-primary-light flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle>Gestão de Alunos</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Cadastre e organize todos os seus alunos em um só lugar, 
                com informações completas e histórico de aulas.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="shadow-card hover:shadow-lg transition-all duration-300">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-lg bg-primary-light flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle>Agenda Inteligente</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Organize suas aulas, confirme agendamentos e tenha 
                controle total sobre sua disponibilidade.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="shadow-card hover:shadow-lg transition-all duration-300">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-lg bg-success-light flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-success" />
                </div>
              </div>
              <CardTitle>Controle Financeiro</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Emita faturas, acompanhe pagamentos e tenha visão 
                clara da sua receita mensal.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="max-w-2xl mx-auto shadow-card bg-gradient-subtle border-primary/20">
            <CardHeader>
              <CardTitle className="text-2xl">
                Pronto para transformar seu ensino?
              </CardTitle>
              <CardDescription className="text-lg">
                Junte-se a centenas de professores que já usam o TutorFlow 
                para organizar e fazer crescer seus negócios.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                size="lg" 
                asChild
                className="bg-gradient-primary shadow-primary hover:bg-primary-hover px-12"
              >
                <a href="/auth">
                  Criar Conta Gratuita
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
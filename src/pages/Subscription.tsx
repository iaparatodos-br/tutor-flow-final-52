import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CalendarDays, CreditCard, Settings, RefreshCw, ExternalLink } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

export default function Subscription() {
  const { currentPlan, subscription, refreshSubscription, loading } = useSubscription();
  const navigate = useNavigate();

  const handleRefresh = async () => {
    try {
      await refreshSubscription();
      toast({
        title: "Atualizado",
        description: "Status da assinatura atualizado com sucesso!",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status da assinatura.",
        variant: "destructive",
      });
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      
      if (error) throw error;
      
      if (data?.url) {
        // Open Stripe Customer Portal in a new tab
        window.open(data.url, '_blank');
        
        toast({
          title: "Portal aberto",
          description: "O portal de gerenciamento foi aberto em uma nova aba.",
        });
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast({
        title: "Erro",
        description: "Não foi possível abrir o portal de gerenciamento.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Carregando informações da assinatura...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Minha Assinatura</h1>
            <p className="text-muted-foreground">
              Gerencie sua assinatura e plano atual
            </p>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Plan Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Plano Atual
                </CardTitle>
                <Badge variant={currentPlan?.slug === 'free' ? 'secondary' : 'default'}>
                  {currentPlan?.name}
                </Badge>
              </div>
              <CardDescription>
                {currentPlan?.price_cents === 0 
                  ? 'Plano gratuito com funcionalidades básicas'
                  : `R$ ${((currentPlan?.price_cents || 0) / 100).toFixed(2)}/mês`
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Limite de Alunos</p>
                  <p className="font-semibold">{currentPlan?.student_limit}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Armazenamento</p>
                  <p className="font-semibold">
                    {currentPlan?.features.storage_mb >= 1024 
                      ? `${(currentPlan.features.storage_mb / 1024).toFixed(0)} GB`
                      : `${currentPlan?.features.storage_mb} MB`
                    }
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="font-medium">Funcionalidades Incluídas:</p>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${
                      currentPlan?.features.financial_module ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    Módulo Financeiro {currentPlan?.features.financial_module ? 'Completo' : 'Básico'}
                  </li>
                  <li className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${
                      currentPlan?.features.group_classes ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    Aulas em Grupo {currentPlan?.features.group_classes ? '' : '(Não incluído)'}
                  </li>
                  <li className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${
                      currentPlan?.features.expenses ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    Cadastro de Despesas {currentPlan?.features.expenses ? '' : '(Não incluído)'}
                  </li>
                </ul>
              </div>

              {currentPlan?.slug !== 'free' && (
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={handleManageSubscription}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Gerenciar no Stripe
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              )}

              {currentPlan?.slug === 'free' && (
                <Button 
                  className="w-full"
                  onClick={() => navigate('/planos')}
                >
                  Fazer Upgrade
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Subscription Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Detalhes da Assinatura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription ? (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
                        {subscription.status === 'active' ? 'Ativa' : subscription.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Próxima Cobrança</p>
                      <p className="font-semibold">
                        {subscription.current_period_end 
                          ? format(new Date(subscription.current_period_end), 'dd/MM/yyyy', { locale: ptBR })
                          : 'N/A'
                        }
                      </p>
                    </div>
                  </div>

                  {subscription.extra_students > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="font-medium text-amber-600">Alunos Adicionais</p>
                        <p className="text-sm text-muted-foreground">
                          {subscription.extra_students} aluno(s) adicional(is)
                        </p>
                        <p className="text-sm font-semibold">
                          + R$ {(subscription.extra_cost_cents / 100).toFixed(2)}/mês
                        </p>
                      </div>
                    </>
                  )}

                  {subscription.cancel_at_period_end && (
                    <>
                      <Separator />
                      <div className="bg-destructive/10 p-3 rounded-md">
                        <p className="text-sm font-medium text-destructive">
                          Assinatura será cancelada
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Acesso até {subscription.current_period_end 
                            ? format(new Date(subscription.current_period_end), 'dd/MM/yyyy', { locale: ptBR })
                            : 'data não definida'
                          }
                        </p>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    Você está no plano gratuito
                  </p>
                  <Button onClick={() => navigate('/planos')}>
                    Ver Planos Pagos
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Billing History */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Cobrança</CardTitle>
            <CardDescription>
              Suas últimas faturas e pagamentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Histórico de cobrança em desenvolvimento</p>
              <p className="text-sm">Em breve você poderá visualizar todas as suas faturas aqui</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
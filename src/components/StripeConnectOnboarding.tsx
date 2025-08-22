import { useState, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, CheckCircle, AlertCircle, Clock, CreditCard } from "lucide-react";

interface StripeConnectAccount {
  id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: any;
  updated_at: string;
}

interface StripeConnectOnboardingProps {
  paymentAccountId?: string;
  onComplete?: () => void;
}

export function StripeConnectOnboarding({ paymentAccountId, onComplete }: StripeConnectOnboardingProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectAccount, setConnectAccount] = useState<StripeConnectAccount | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadConnectAccount();
    }
  }, [profile?.id]);

  const loadConnectAccount = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stripe_connect_accounts')
        .select('*')
        .eq('teacher_id', profile.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setConnectAccount(data);
    } catch (error) {
      console.error('Error loading connect account:', error);
    } finally {
      setLoading(false);
    }
  };

  const createConnectAccount = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: { 
          country: 'BR', 
          account_type: 'express' 
        }
      });

      if (error) throw error;

      toast({
        title: "Conta Stripe criada",
        description: "Sua conta Stripe Connect foi criada com sucesso",
      });

      await loadConnectAccount();
      
      // Automatically start onboarding
      if (data.account_id) {
        await startOnboarding();
      }
    } catch (error: any) {
      console.error('Error creating connect account:', error);
      toast({
        title: "Erro ao criar conta",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const startOnboarding = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-onboarding-link');

      if (error) throw error;

      if (data.url) {
        window.open(data.url, '_blank');
        toast({
          title: "Redirecionando",
          description: "Complete o processo de verificação no Stripe",
        });
      }
    } catch (error: any) {
      console.error('Error creating onboarding link:', error);
      toast({
        title: "Erro ao iniciar verificação",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const syncWithStripe = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('refresh-stripe-connect-account');

      if (error) throw error;

      toast({
        title: "Sincronização concluída",
        description: "Status da conta atualizado com sucesso",
      });

      await loadConnectAccount();
      onComplete?.();
    } catch (error: any) {
      console.error('Error syncing with Stripe:', error);
      toast({
        title: "Erro na sincronização",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const getAccountStatus = () => {
    if (!connectAccount) return { status: 'not_created', label: 'Não configurado', color: 'secondary' };
    
    if (connectAccount.charges_enabled && connectAccount.payouts_enabled) {
      return { status: 'active', label: 'Ativo', color: 'default' };
    }
    
    if (connectAccount.details_submitted) {
      return { status: 'pending', label: 'Em análise', color: 'secondary' };
    }
    
    return { status: 'incomplete', label: 'Verificação pendente', color: 'destructive' };
  };

  const getStatusIcon = () => {
    const status = getAccountStatus().status;
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'incomplete':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <CreditCard className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading && !connectAccount) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-muted-foreground">Verificando configuração do Stripe...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusInfo = getAccountStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Configuração Stripe Connect
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="font-medium">Status da Conta</span>
          </div>
          <Badge variant={statusInfo.color as any}>
            {statusInfo.label}
          </Badge>
        </div>

        {connectAccount && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Pagamentos habilitados:</span>
              <span className={connectAccount.charges_enabled ? "text-green-600" : "text-red-600"}>
                {connectAccount.charges_enabled ? "Sim" : "Não"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Saques habilitados:</span>
              <span className={connectAccount.payouts_enabled ? "text-green-600" : "text-red-600"}>
                {connectAccount.payouts_enabled ? "Sim" : "Não"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Verificação completa:</span>
              <span className={connectAccount.details_submitted ? "text-green-600" : "text-red-600"}>
                {connectAccount.details_submitted ? "Sim" : "Não"}
              </span>
            </div>
          </div>
        )}

        <div className="pt-4 space-y-2">
          {!connectAccount ? (
            <Button 
              onClick={createConnectAccount} 
              disabled={creating}
              className="w-full"
            >
              {creating ? "Criando conta..." : "Criar conta Stripe"}
            </Button>
          ) : (
            <>
              {!connectAccount.details_submitted && (
                <Button 
                  onClick={startOnboarding} 
                  disabled={loading}
                  className="w-full"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {loading ? "Gerando link..." : "Completar verificação"}
                </Button>
              )}
              
              <Button 
                variant="outline" 
                onClick={syncWithStripe}
                disabled={syncing || loading}
                className="w-full"
              >
                {syncing ? "Sincronizando..." : "Sincronizar com a Stripe"}
              </Button>
            </>
          )}
        </div>

        {connectAccount && !connectAccount.charges_enabled && (
          <div className="p-3 border border-yellow-200 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-800">
              <AlertCircle className="h-4 w-4 inline mr-2" />
              Complete a verificação no Stripe para começar a receber pagamentos via boleto e PIX.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
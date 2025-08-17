import { useState, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PaymentAccountModal } from "@/components/PaymentAccountModal";
import { 
  CreditCard, 
  Plus, 
  Trash2, 
  Edit, 
  Star,
  Building2,
  Smartphone,
  DollarSign
} from "lucide-react";

interface PaymentAccount {
  id: string;
  account_name: string;
  account_type: string;
  pix_key?: string;
  pix_key_type?: string;
  bank_name?: string;
  agency?: string;
  account_number?: string;
  account_holder_name?: string;
  stripe_account_id?: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export function PaymentAccountsManager() {
  const { profile } = useProfile();
  const { toast } = useToast();
  
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadAccounts();
    }
  }, [profile?.id]);

  const loadAccounts = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .eq('teacher_id', profile.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
      toast({
        title: "Erro ao carregar contas",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (accountId: string) => {
    if (!profile?.id) return;

    try {
      // Remove default from all accounts
      await supabase
        .from('payment_accounts')
        .update({ is_default: false })
        .eq('teacher_id', profile.id);

      // Set new default
      const { error } = await supabase
        .from('payment_accounts')
        .update({ is_default: true })
        .eq('id', accountId);

      if (error) throw error;

      toast({
        title: "Conta padrão alterada",
        description: "A conta foi definida como padrão para novos alunos",
      });

      loadAccounts();
    } catch (error) {
      console.error('Erro ao alterar conta padrão:', error);
      toast({
        title: "Erro ao alterar conta padrão",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (accountId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('payment_accounts')
        .update({ is_active: !currentActive })
        .eq('id', accountId);

      if (error) throw error;

      toast({
        title: currentActive ? "Conta desativada" : "Conta ativada",
        description: `A conta foi ${currentActive ? 'desativada' : 'ativada'} com sucesso`,
      });

      loadAccounts();
    } catch (error) {
      console.error('Erro ao alterar status da conta:', error);
      toast({
        title: "Erro ao alterar status",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (accountId: string) => {
    if (accounts.filter(a => a.is_active).length <= 1) {
      toast({
        title: "Não é possível excluir",
        description: "Você deve ter pelo menos uma conta ativa",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('payment_accounts')
        .delete()
        .eq('id', accountId);

      if (error) throw error;

      toast({
        title: "Conta excluída",
        description: "A conta foi excluída com sucesso",
      });

      loadAccounts();
    } catch (error) {
      console.error('Erro ao excluir conta:', error);
      toast({
        title: "Erro ao excluir conta",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (account: PaymentAccount) => {
    setEditingAccount(account);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingAccount(null);
    loadAccounts();
  };

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case 'pix': return <Smartphone className="h-5 w-5 text-primary" />;
      case 'conta_bancaria': return <Building2 className="h-5 w-5 text-primary" />;
      case 'stripe': return <CreditCard className="h-5 w-5 text-primary" />;
      default: return <DollarSign className="h-5 w-5 text-primary" />;
    }
  };

  const getAccountTypeLabel = (type: string) => {
    switch (type) {
      case 'pix': return 'PIX';
      case 'conta_bancaria': return 'Conta Bancária';
      case 'stripe': return 'Stripe';
      default: return type;
    }
  };

  const getAccountDetails = (account: PaymentAccount) => {
    switch (account.account_type) {
      case 'pix':
        return account.pix_key;
      case 'conta_bancaria':
        return `${account.bank_name} - Ag: ${account.agency} CC: ${account.account_number}`;
      case 'stripe':
        return `ID: ${account.stripe_account_id}`;
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Contas de Recebimento</h2>
            <p className="text-muted-foreground">Gerencie suas contas para recebimento de pagamentos</p>
          </div>
        </div>
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando contas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Contas de Recebimento</h2>
          <p className="text-muted-foreground">Gerencie suas contas para recebimento de pagamentos</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Conta
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="text-center py-12">
            <CreditCard className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Nenhuma conta cadastrada</h3>
            <p className="text-muted-foreground mb-6">
              Cadastre suas contas para recebimento de pagamentos
            </p>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar primeira conta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id} className="shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getAccountTypeIcon(account.account_type)}
                    <CardTitle className="text-lg">{account.account_name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    {account.is_default && (
                      <Star className="h-4 w-4 fill-primary text-primary" />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant={account.is_active ? "default" : "secondary"}>
                    {getAccountTypeLabel(account.account_type)}
                  </Badge>
                  {account.is_default && (
                    <Badge variant="outline">Padrão</Badge>
                  )}
                  {!account.is_active && (
                    <Badge variant="destructive">Inativa</Badge>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  {getAccountDetails(account)}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(account)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(account.id, account.is_active)}
                    >
                      {account.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(account.id)}
                      disabled={accounts.filter(a => a.is_active).length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {!account.is_default && account.is_active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(account.id)}
                    >
                      Definir como Padrão
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PaymentAccountModal
        open={modalOpen}
        onClose={handleModalClose}
        account={editingAccount}
      />
    </div>
  );
}
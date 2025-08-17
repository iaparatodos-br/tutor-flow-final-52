import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Building2, Smartphone, DollarSign } from "lucide-react";

interface PaymentAccount {
  id: string;
  account_name: string;
  account_type: string;
  pix_key?: string;
  bank_name?: string;
  agency?: string;
  account_number?: string;
  stripe_account_id?: string;
  is_active: boolean;
}

interface PaymentAccountSelectorProps {
  studentId: string;
  onUpdate?: () => void;
}

export function PaymentAccountSelector({ studentId, onUpdate }: PaymentAccountSelectorProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id && studentId) {
      loadData();
    }
  }, [profile?.id, studentId]);

  const loadData = async () => {
    if (!profile?.id) return;

    try {
      // Load payment accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('payment_accounts')
        .select('*')
        .eq('teacher_id', profile.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false });

      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);

      // Load current student preferred account
      const { data: studentData, error: studentError } = await supabase
        .from('profiles')
        .select('preferred_payment_account_id')
        .eq('id', studentId)
        .single();

      if (studentError) throw studentError;
      
      // Set selected account or default to first active account
      if (studentData?.preferred_payment_account_id) {
        setSelectedAccountId(studentData.preferred_payment_account_id);
      } else if (accountsData && accountsData.length > 0) {
        // Set default account or first active account
        const defaultAccount = accountsData.find(a => a.is_active) || accountsData[0];
        if (defaultAccount) {
          setSelectedAccountId(defaultAccount.id);
          // Auto-save default selection
          handleAccountChange(defaultAccount.id);
        }
      }

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: "Erro ao carregar contas",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAccountChange = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_payment_account_id: accountId })
        .eq('id', studentId);

      if (error) throw error;

      setSelectedAccountId(accountId);
      
      toast({
        title: "Conta de recebimento atualizada",
        description: "A conta preferencial foi alterada com sucesso",
      });

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Erro ao atualizar conta:', error);
      toast({
        title: "Erro ao atualizar conta",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case 'pix': return <Smartphone className="h-4 w-4 text-primary" />;
      case 'conta_bancaria': return <Building2 className="h-4 w-4 text-primary" />;
      case 'stripe': return <CreditCard className="h-4 w-4 text-primary" />;
      default: return <DollarSign className="h-4 w-4 text-primary" />;
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
      <Card className="shadow-card">
        <CardContent className="pt-6">
          <div className="text-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Conta de Recebimento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <CreditCard className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma conta de recebimento ativa encontrada
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Conta de Recebimento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            Conta para recebimento dos pagamentos deste aluno
          </label>
          <Select value={selectedAccountId} onValueChange={handleAccountChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma conta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  <div className="flex items-center gap-2">
                    {getAccountTypeIcon(account.account_type)}
                    <span>{account.account_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({getAccountTypeLabel(account.account_type)})
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedAccount && (
          <div className="bg-muted p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              {getAccountTypeIcon(selectedAccount.account_type)}
              <span className="font-medium">{selectedAccount.account_name}</span>
              <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                {getAccountTypeLabel(selectedAccount.account_type)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {getAccountDetails(selectedAccount)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
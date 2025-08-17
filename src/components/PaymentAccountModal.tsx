import { useState, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface PaymentAccount {
  id: string;
  account_name: string;
  account_type: string;
  pix_key?: string;
  pix_key_type?: string;
  bank_code?: string;
  bank_name?: string;
  agency?: string;
  account_number?: string;
  account_holder_name?: string;
  account_holder_document?: string;
  stripe_account_id?: string;
  is_active: boolean;
  is_default: boolean;
}

interface PaymentAccountModalProps {
  open: boolean;
  onClose: () => void;
  account?: PaymentAccount | null;
}

export function PaymentAccountModal({ open, onClose, account }: PaymentAccountModalProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    account_name: '',
    account_type: 'pix' as string,
    pix_key: '',
    pix_key_type: 'cpf' as string,
    bank_code: '',
    bank_name: '',
    agency: '',
    account_number: '',
    account_holder_name: '',
    account_holder_document: '',
    stripe_account_id: '',
    is_active: true,
  });

  useEffect(() => {
    if (account) {
      setFormData({
        account_name: account.account_name || '',
        account_type: account.account_type as string || 'pix',
        pix_key: account.pix_key || '',
        pix_key_type: (account.pix_key_type as any) || 'cpf',
        bank_code: account.bank_code || '',
        bank_name: account.bank_name || '',
        agency: account.agency || '',
        account_number: account.account_number || '',
        account_holder_name: account.account_holder_name || '',
        account_holder_document: account.account_holder_document || '',
        stripe_account_id: account.stripe_account_id || '',
        is_active: account.is_active,
      });
    } else {
      setFormData({
        account_name: '',
        account_type: 'pix',
        pix_key: '',
        pix_key_type: 'cpf',
        bank_code: '',
        bank_name: '',
        agency: '',
        account_number: '',
        account_holder_name: '',
        account_holder_document: '',
        stripe_account_id: '',
        is_active: true,
      });
    }
  }, [account, open]);

  const handleSave = async () => {
    if (!profile?.id) return;

    if (!formData.account_name.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Informe um nome para a conta",
        variant: "destructive",
      });
      return;
    }

    // Validar campos específicos por tipo de conta
    if (formData.account_type === 'pix' && !formData.pix_key.trim()) {
      toast({
        title: "Chave PIX obrigatória",
        description: "Informe a chave PIX",
        variant: "destructive",
      });
      return;
    }

    if (formData.account_type === 'conta_bancaria') {
      if (!formData.bank_name.trim() || !formData.agency.trim() || !formData.account_number.trim() || !formData.account_holder_name.trim()) {
        toast({
          title: "Dados bancários incompletos",
          description: "Preencha todos os campos da conta bancária",
          variant: "destructive",
        });
        return;
      }
    }

    if (formData.account_type === 'stripe' && !formData.stripe_account_id.trim()) {
      toast({
        title: "ID do Stripe obrigatório",
        description: "Informe o ID da conta do Stripe",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const accountData = {
        teacher_id: profile.id,
        account_name: formData.account_name,
        account_type: formData.account_type,
        pix_key: formData.account_type === 'pix' ? formData.pix_key : null,
        pix_key_type: formData.account_type === 'pix' ? formData.pix_key_type : null,
        bank_code: formData.account_type === 'conta_bancaria' ? formData.bank_code : null,
        bank_name: formData.account_type === 'conta_bancaria' ? formData.bank_name : null,
        agency: formData.account_type === 'conta_bancaria' ? formData.agency : null,
        account_number: formData.account_type === 'conta_bancaria' ? formData.account_number : null,
        account_holder_name: formData.account_type === 'conta_bancaria' ? formData.account_holder_name : null,
        account_holder_document: formData.account_type === 'conta_bancaria' ? formData.account_holder_document : null,
        stripe_account_id: formData.account_type === 'stripe' ? formData.stripe_account_id : null,
        is_active: formData.is_active,
      };

      let error;
      
      if (account) {
        // Atualizar conta existente
        const { error: updateError } = await supabase
          .from('payment_accounts')
          .update(accountData)
          .eq('id', account.id);
        error = updateError;
      } else {
        // Criar nova conta
        const { error: insertError } = await supabase
          .from('payment_accounts')
          .insert(accountData);
        error = insertError;
        
        // Se é a primeira conta, definir como padrão
        if (!error) {
          const { count } = await supabase
            .from('payment_accounts')
            .select('*', { count: 'exact', head: true })
            .eq('teacher_id', profile.id);
          
          if (count === 1) {
            await supabase
              .from('payment_accounts')
              .update({ is_default: true })
              .eq('teacher_id', profile.id)
              .eq('account_name', formData.account_name);
          }
        }
      }

      if (error) throw error;

      toast({
        title: account ? "Conta atualizada" : "Conta cadastrada",
        description: `A conta foi ${account ? 'atualizada' : 'cadastrada'} com sucesso`,
      });

      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar conta:', error);
      toast({
        title: "Erro ao salvar conta",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const renderAccountTypeFields = () => {
    switch (formData.account_type) {
      case 'pix':
        return (
          <div className="grid gap-4">
            <div>
              <Label htmlFor="pix_key_type">Tipo da Chave PIX</Label>
              <Select value={formData.pix_key_type} onValueChange={(value: any) => setFormData(prev => ({ ...prev, pix_key_type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="cnpj">CNPJ</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="chave_aleatoria">Chave Aleatória</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pix_key">Chave PIX</Label>
              <Input
                id="pix_key"
                value={formData.pix_key}
                onChange={(e) => setFormData(prev => ({ ...prev, pix_key: e.target.value }))}
                placeholder="Digite a chave PIX"
              />
            </div>
          </div>
        );

      case 'conta_bancaria':
        return (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bank_code">Código do Banco</Label>
                <Input
                  id="bank_code"
                  value={formData.bank_code}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_code: e.target.value }))}
                  placeholder="Ex: 001"
                />
              </div>
              <div>
                <Label htmlFor="bank_name">Nome do Banco</Label>
                <Input
                  id="bank_name"
                  value={formData.bank_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                  placeholder="Ex: Banco do Brasil"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="agency">Agência</Label>
                <Input
                  id="agency"
                  value={formData.agency}
                  onChange={(e) => setFormData(prev => ({ ...prev, agency: e.target.value }))}
                  placeholder="Ex: 1234-5"
                />
              </div>
              <div>
                <Label htmlFor="account_number">Número da Conta</Label>
                <Input
                  id="account_number"
                  value={formData.account_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, account_number: e.target.value }))}
                  placeholder="Ex: 12345-6"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="account_holder_name">Titular da Conta</Label>
              <Input
                id="account_holder_name"
                value={formData.account_holder_name}
                onChange={(e) => setFormData(prev => ({ ...prev, account_holder_name: e.target.value }))}
                placeholder="Nome completo do titular"
              />
            </div>
            <div>
              <Label htmlFor="account_holder_document">CPF/CNPJ do Titular</Label>
              <Input
                id="account_holder_document"
                value={formData.account_holder_document}
                onChange={(e) => setFormData(prev => ({ ...prev, account_holder_document: e.target.value }))}
                placeholder="000.000.000-00"
              />
            </div>
          </div>
        );

      case 'stripe':
        return (
          <div>
            <Label htmlFor="stripe_account_id">ID da Conta Stripe</Label>
            <Input
              id="stripe_account_id"
              value={formData.stripe_account_id}
              onChange={(e) => setFormData(prev => ({ ...prev, stripe_account_id: e.target.value }))}
              placeholder="acct_xxxxxxxxxx"
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {account ? 'Editar Conta de Recebimento' : 'Nova Conta de Recebimento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4">
            <div>
              <Label htmlFor="account_name">Nome da Conta</Label>
              <Input
                id="account_name"
                value={formData.account_name}
                onChange={(e) => setFormData(prev => ({ ...prev, account_name: e.target.value }))}
                placeholder="Ex: Conta Principal, PIX Pessoal"
              />
            </div>

            <div>
              <Label htmlFor="account_type">Tipo de Conta</Label>
              <Select value={formData.account_type} onValueChange={(value: any) => setFormData(prev => ({ ...prev, account_type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="conta_bancaria">Conta Bancária</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {renderAccountTypeFields()}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : (account ? "Atualizar" : "Cadastrar")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
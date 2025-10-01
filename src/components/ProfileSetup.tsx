import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { validateCPF, formatCPF, formatCEP } from '@/utils/validation';

export function ProfileSetup() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    cpf: '',
    address_street: '',
    address_city: '',
    address_state: '',
    address_postal_code: ''
  });

  const handleInputChange = (field: string, value: string) => {
    let formattedValue = value;
    
    if (field === 'cpf') {
      formattedValue = formatCPF(value);
    } else if (field === 'address_postal_code') {
      formattedValue = formatCEP(value);
    }
    
    setFormData(prev => ({
      ...prev,
      [field]: formattedValue
    }));
  };

  const isFormValid = () => {
    return (
      validateCPF(formData.cpf) &&
      formData.address_street.trim() !== '' &&
      formData.address_city.trim() !== '' &&
      formData.address_state.trim() !== '' &&
      formData.address_postal_code.length === 9
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('ProfileSetup: handleSubmit called', {
      profileId: profile?.id,
      role: profile?.role,
      formData: {
        cpf: formData.cpf,
        address_street: formData.address_street,
        address_city: formData.address_city,
        address_state: formData.address_state,
        address_postal_code: formData.address_postal_code
      }
    });
    
    if (!isFormValid()) {
      console.log('ProfileSetup: Form validation failed');
      toast({
        title: "Dados incompletos",
        description: "Por favor, preencha todos os campos corretamente.",
        variant: "destructive"
      });
      return;
    }

    console.log('ProfileSetup: Form is valid, starting update...');
    setLoading(true);

    try {
      const updateData = {
        cpf: formData.cpf.replace(/\D/g, ''),
        address_street: formData.address_street,
        address_city: formData.address_city,
        address_state: formData.address_state,
        address_postal_code: formData.address_postal_code.replace(/\D/g, ''),
        address_complete: true
      };
      
      console.log('ProfileSetup: Updating profile with data:', updateData);
      
      const { data, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', profile?.id)
        .select();

      console.log('ProfileSetup: Update response:', { data, error });

      if (error) {
        console.error('ProfileSetup: Update error:', error);
        throw error;
      }

      console.log('ProfileSetup: Profile updated successfully');

      toast({
        title: "Perfil atualizado!",
        description: "Suas informações foram salvas com sucesso."
      });

      console.log('ProfileSetup: Perfil atualizado, redirecionando...', {
        userId: profile?.id,
        role: profile?.role
      });

      // Redireciona para a página apropriada baseado no role
      const redirectPath = profile?.role === 'aluno' ? '/portal-do-aluno' : '/dashboard';
      console.log('ProfileSetup: Navigating to:', redirectPath);
      
      // Use window.location.href for more reliable redirect
      window.location.href = redirectPath;
    } catch (error) {
      console.error('ProfileSetup: Catch block - Erro ao atualizar perfil:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar suas informações. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      console.log('ProfileSetup: Finally block - setLoading(false)');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Complete seu perfil</CardTitle>
          <CardDescription>
            Para utilizar os recursos de pagamento, precisamos de algumas informações adicionais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                type="text"
                value={formData.cpf}
                onChange={(e) => handleInputChange('cpf', e.target.value)}
                placeholder="000.000.000-00"
                maxLength={14}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address_street">Endereço (Rua/Logradouro)</Label>
              <Input
                id="address_street"
                type="text"
                value={formData.address_street}
                onChange={(e) => handleInputChange('address_street', e.target.value)}
                placeholder="Rua das Flores, 123"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="address_city">Cidade</Label>
                <Input
                  id="address_city"
                  type="text"
                  value={formData.address_city}
                  onChange={(e) => handleInputChange('address_city', e.target.value)}
                  placeholder="São Paulo"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address_state">Estado</Label>
                <Input
                  id="address_state"
                  type="text"
                  value={formData.address_state}
                  onChange={(e) => handleInputChange('address_state', e.target.value)}
                  placeholder="SP"
                  maxLength={2}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address_postal_code">CEP</Label>
              <Input
                id="address_postal_code"
                type="text"
                value={formData.address_postal_code}
                onChange={(e) => handleInputChange('address_postal_code', e.target.value)}
                placeholder="00000-000"
                maxLength={9}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !isFormValid()}
            >
              {loading ? 'Salvando...' : 'Salvar informações'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
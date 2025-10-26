import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ForcePasswordChange() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  console.log('ForcePasswordChange: Profile loaded', {
    profileId: profile?.id,
    passwordChanged: profile?.password_changed,
    email: profile?.email
  });

  // Check if user was invited (doesn't have a current password)
  const isInvitedUser = profile?.password_changed === false;
  
  console.log('ForcePasswordChange: isInvitedUser =', isInvitedUser);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('ForcePasswordChange: handlePasswordChange called', {
      isInvitedUser,
      newPasswordLength: newPassword.length,
      hasConfirmPassword: !!confirmPassword,
      hasCurrentPassword: !!currentPassword
    });
    
    if (newPassword.length < 8) {
      toast({
        title: "Erro",
        description: "A nova senha deve ter pelo menos 8 caracteres",
        variant: "destructive",
      });
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      toast({
        title: "Erro", 
        description: "A senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Erro", 
        description: "As senhas não coincidem",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log('ForcePasswordChange: Updating password in Supabase...');
      
      // Update password in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (authError) {
        console.error('ForcePasswordChange: Auth error', authError);
        throw authError;
      }
      
      console.log('ForcePasswordChange: Password updated successfully');

      // Update password_changed flag in profiles
      console.log('ForcePasswordChange: Updating password_changed flag...');
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ password_changed: true })
        .eq("id", profile?.id);

      if (profileError) {
        console.error('ForcePasswordChange: Profile update error', profileError);
        throw profileError;
      }
      
      console.log('ForcePasswordChange: Profile updated successfully');

      // Registrar aceite de termos se for aluno convidado
      if (isInvitedUser && termsAccepted && profile?.role === 'aluno') {
        console.log('ForcePasswordChange: Registrando aceite de termos para aluno');
        
        const { error: termsError } = await supabase
          .from('term_acceptances')
          .insert({
            user_id: profile.id,
            terms_version: 'v1.0-2025-10-25',
            privacy_policy_version: 'v1.0-2025-10-25',
            ip_address: null,
            user_agent: navigator.userAgent
          });

        if (termsError) {
          console.error('ForcePasswordChange: Erro ao registrar aceite de termos:', termsError);
        } else {
          console.log('ForcePasswordChange: Aceite de termos registrado com sucesso');
        }
      }

      toast({
        title: "Sucesso",
        description: isInvitedUser 
          ? "Senha criada com sucesso! Redirecionando..."
          : "Senha alterada com sucesso! Redirecionando...",
      });

      console.log('ForcePasswordChange: Senha atualizada, redirecionando...', {
        userId: profile?.id,
        role: profile?.role
      });

      // Small delay before redirect to show success message
      setTimeout(() => {
        const redirectPath = profile?.role === 'aluno' ? '/portal-do-aluno' : '/dashboard';
        console.log('ForcePasswordChange: Redirecionando para', redirectPath);
        window.location.href = redirectPath;
      }, 2000);

    } catch (error: any) {
      console.error("Error changing password:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao alterar senha",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-bold">
            {isInvitedUser ? "Criar Sua Senha" : "Alterar Senha Obrigatória"}
          </CardTitle>
          <CardDescription>
            {isInvitedUser 
              ? "Bem-vindo! Para acessar o sistema, é necessário criar sua senha."
              : "Por segurança, é necessário criar uma nova senha na primeira vez que você acessa o sistema."
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            {!isInvitedUser && (
              <div className="space-y-2">
                <Label htmlFor="current-password">Senha Atual</Label>
                <Input
                  id="current-password"
                  type="password"
                  placeholder="Digite sua senha atual"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Mínimo 8 caracteres com maiúscula, minúscula e número"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Digite novamente sua nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            {isInvitedUser && (
              <div className="flex items-start space-x-2 p-4 bg-muted/50 rounded-lg border">
                <Checkbox
                  id="terms-acceptance"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                  required
                />
                <Label 
                  htmlFor="terms-acceptance" 
                  className="text-sm leading-tight cursor-pointer"
                >
                  Li e concordo com os{' '}
                  <a 
                    href="/legal" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    Termos de Uso
                  </a>
                  {' '}e{' '}
                  <a 
                    href="/legal" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    Política de Privacidade
                  </a>
                  {' '}da plataforma
                </Label>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full"
              disabled={
                isLoading || 
                (!isInvitedUser && !currentPassword) || 
                !newPassword || 
                !confirmPassword ||
                (isInvitedUser && !termsAccepted)
              }
            >
              {isLoading ? 
                (isInvitedUser ? "Criando..." : "Alterando...") : 
                (isInvitedUser ? "Criar Senha" : "Alterar Senha")
              }
            </Button>
          </form>

          <div className="mt-4 p-3 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              <strong>Importante:</strong> {isInvitedUser 
                ? "É necessário criar sua senha para acessar o sistema. Você será redirecionado após criar sua senha com sucesso."
                : "Esta alteração é obrigatória e não pode ser ignorada. Você será redirecionado para o sistema após alterar sua senha com sucesso."
              }
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
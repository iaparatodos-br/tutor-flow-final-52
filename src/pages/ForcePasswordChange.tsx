import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ForcePasswordChange() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  // Check if user was invited (doesn't have a current password)
  const isInvitedUser = profile?.password_changed === false;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      // Update password in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (authError) {
        throw authError;
      }

      // Update password_changed flag in profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ password_changed: true })
        .eq("id", profile?.id);

      if (profileError) {
        throw profileError;
      }

      toast({
        title: "Sucesso",
        description: isInvitedUser 
          ? "Senha criada com sucesso! Redirecionando..."
          : "Senha alterada com sucesso! Redirecionando...",
      });

      // Small delay before redirect to show success message
      setTimeout(() => {
        window.location.href = "/dashboard";
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

            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading || (!isInvitedUser && !currentPassword) || !newPassword || !confirmPassword}
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
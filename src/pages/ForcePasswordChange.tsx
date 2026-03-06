import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, invalidateProfileCache } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle } from "lucide-react";

export default function ForcePasswordChange() {
  const { t } = useTranslation('password');
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  // Check if user was invited (doesn't have a current password)
  const isInvitedUser = profile?.password_changed === false;

  // Se a senha já foi salva, mostrar tela de sucesso
  if (passwordSaved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold">{t('messages.success')}</h2>
              <p className="text-muted-foreground">{t('messages.successDescription')}</p>
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword.length < 8) {
      toast({
        title: t('messages.error'),
        description: t('validation.minLength'),
        variant: "destructive",
      });
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      toast({
        title: t('messages.error'), 
        description: t('validation.complexity'),
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: t('messages.error'), 
        description: t('validation.match'),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    // Proteger contra unmount/remount imediato
    setPasswordSaved(true);

    try {
      // 1. PRIMEIRO: Atualizar flag no banco (enquanto JWT ainda é válido)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ password_changed: true })
        .eq("id", profile?.id);

      if (profileError) {
        console.error('ForcePasswordChange: Profile update error', profileError);
        setPasswordSaved(false);
        throw profileError;
      }

      // 2. DEPOIS: Atualizar senha no Auth (pode invalidar JWT)
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (authError) {
        // Se erro "same_password", a senha já foi salva anteriormente - sucesso
        const isSamePassword = authError.message?.includes('same_password') || 
          authError.message?.includes('should be different');
        
        if (!isSamePassword) {
          // Reverter flag do perfil já que a senha não foi atualizada
          console.error('ForcePasswordChange: Auth error', authError);
          await supabase.from("profiles")
            .update({ password_changed: false })
            .eq("id", profile?.id);
          setPasswordSaved(false);
          throw authError;
        }
        // Se same_password, continuar normalmente - senha já existe
        console.log('ForcePasswordChange: same_password detected, proceeding with redirect');
      }

      // 3. Invalidar cache do perfil
      if (profile?.id) {
        invalidateProfileCache(profile.id);
      }

      // 4. Registrar aceite de termos se for aluno convidado
      if (isInvitedUser && termsAccepted && profile?.role === 'aluno') {
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
        }
      }

      toast({
        title: t('messages.success'),
        description: t('messages.successDescription'),
      });

      // 5. SignOut + redirecionar para login
      await supabase.auth.signOut();
      setTimeout(() => {
        window.location.replace('/auth');
      }, 500);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('messages.errorDescription');
      console.error("Error changing password:", error);
      toast({
        title: t('messages.error'),
        description: errorMessage,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-bold">
            {isInvitedUser ? t('title.invited') : t('title.change')}
          </CardTitle>
          <CardDescription>
            {isInvitedUser ? t('description.invited') : t('description.change')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            {!isInvitedUser && (
              <div className="space-y-2">
                <Label htmlFor="current-password">{t('fields.currentPassword')}</Label>
                <Input
                  id="current-password"
                  type="password"
                  placeholder={t('fields.currentPasswordPlaceholder')}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="new-password">{t('fields.newPassword')}</Label>
              <Input
                id="new-password"
                type="password"
                placeholder={t('fields.newPasswordPlaceholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t('fields.confirmPassword')}</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder={t('fields.confirmPasswordPlaceholder')}
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
                  {t('terms.acceptance', {
                    termsLink: `<a href="/legal" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium">${t('terms.termsOfService')}</a>`,
                    privacyLink: `<a href="/legal" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium">${t('terms.privacyPolicy')}</a>`
                  }).split(/(<a[^>]*>.*?<\/a>)/g).map((part, index) => {
                    if (part.startsWith('<a')) {
                      const hrefMatch = part.match(/href="([^"]*)"/);
                      const textMatch = part.match(/>([^<]*)</);
                      if (hrefMatch && textMatch) {
                        return (
                          <a
                            key={index}
                            href={hrefMatch[1]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-medium"
                          >
                            {textMatch[1]}
                          </a>
                        );
                      }
                    }
                    return part;
                  })}
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
                (isInvitedUser ? t('buttons.creating') : t('buttons.changing')) : 
                (isInvitedUser ? t('buttons.create') : t('buttons.change'))
              }
            </Button>
          </form>

          <div className="mt-4 p-3 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              <strong>{t('notice.title')}:</strong> {t('notice.description')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

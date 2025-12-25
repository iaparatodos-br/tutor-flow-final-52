import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ForcePasswordChange() {
  const { t } = useTranslation('password');
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
        title: t('messages.success'),
        description: t('messages.successDescription'),
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
        title: t('messages.error'),
        description: error.message || t('messages.errorDescription'),
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

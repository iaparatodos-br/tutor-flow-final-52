import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

export default function ResetPassword() {
  const { toast } = useToast();
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ password: false, confirmPassword: false });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // CORREÇÃO: Detectar tokens de ambos query params (?) e hash (#)
  const getTokensFromUrl = () => {
    console.log('🔑 ResetPassword: URL atual:', window.location.href);
    console.log('🔑 ResetPassword: Query params:', window.location.search);
    console.log('🔑 ResetPassword: Hash:', window.location.hash);
    
    // Tentar query params primeiro (?access_token=...)
    let params = new URLSearchParams(window.location.search);
    
    // Se não encontrar tokens, tentar hash (#access_token=...)
    if (!params.get('access_token') && window.location.hash) {
      const hash = window.location.hash.substring(1); // Remove o #
      params = new URLSearchParams(hash);
      console.log('🔑 ResetPassword: Usando tokens do hash');
    }
    
    const tokens = {
      accessToken: params.get('access_token'),
      refreshToken: params.get('refresh_token'),
      type: params.get('type')
    };
    
    console.log('🔑 ResetPassword: Tokens detectados:', { 
      accessToken: !!tokens.accessToken, 
      refreshToken: !!tokens.refreshToken, 
      type: tokens.type 
    });
    
    return tokens;
  };

  const { accessToken, refreshToken, type } = getTokensFromUrl();
  
  // If no recovery tokens, redirect to auth with error message
  if (!accessToken || !refreshToken || type !== 'recovery') {
    console.error('❌ ResetPassword: Tokens inválidos ou ausentes');
    
    toast({
      title: "Link inválido ou expirado",
      description: "O link de recuperação pode ter expirado. Por favor, solicite um novo link.",
      variant: "destructive"
    });
    
    return <Navigate to="/auth" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Enhanced validation
    const validationErrors = {
      password: !form.password || 
                form.password.length < 8 ||
                !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(form.password),
      confirmPassword: !form.confirmPassword || form.password !== form.confirmPassword
    };
    setErrors(validationErrors);
    
    if (Object.values(validationErrors).some(Boolean)) {
      return;
    }
    
    setLoading(true);
    
    try {
      console.log('ResetPassword: Setting session and updating password');
      
      // Set session with recovery tokens first
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      
      if (sessionError) {
        throw new Error(sessionError.message);
      }
      
      // Now update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: form.password
      });
      
      if (updateError) {
        throw new Error(updateError.message);
      }
      
      toast({
        title: "Senha redefinida!",
        description: t('messages.resetPasswordSuccess'),
      });
      
      // Clear URL params and redirect to dashboard
      window.history.replaceState(null, '', '/reset-password');
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
      
    } catch (error: any) {
      console.error('ResetPassword: Error updating password:', error);
      toast({
        title: "Erro ao redefinir senha",
        description: error.message?.includes("expired") 
          ? t('messages.resetLinkExpired')
          : error.message || 'Erro inesperado',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-primary">
              <GraduationCap className="h-8 w-8" />
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            TutorFlow
          </h1>
          <p className="text-muted-foreground mt-2">
            {t('resetPassword')}
          </p>
        </div>

        <Card className="shadow-card">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToLogin}
                  className="p-1 h-auto"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {t('resetPassword')}
              </CardTitle>
              <CardDescription>
                Digite sua nova senha. Ela deve ter pelo menos 8 caracteres com maiúscula, minúscula e número.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t('fields.newPassword')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Nova senha"
                    value={form.password}
                    onChange={(e) => {
                      setForm(prev => ({ ...prev, password: e.target.value }));
                      setErrors(prev => ({ ...prev, password: false }));
                    }}
                    className={errors.password ? "border-destructive pr-10" : "pr-10"}
                    required
                    minLength={8}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">
                    Senha deve ter ao menos 8 caracteres com maiúscula, minúscula e número
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('fields.confirmPassword')}</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirme a nova senha"
                    value={form.confirmPassword}
                    onChange={(e) => {
                      setForm(prev => ({ ...prev, confirmPassword: e.target.value }));
                      setErrors(prev => ({ ...prev, confirmPassword: false }));
                    }}
                    className={errors.confirmPassword ? "border-destructive pr-10" : "pr-10"}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    As senhas não coincidem
                  </p>
                )}
              </div>
            </CardContent>
            <CardContent>
              <Button 
                type="submit" 
                className="w-full bg-gradient-primary hover:bg-primary-hover shadow-primary"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('resetPassword')}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
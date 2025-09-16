import { useState, useEffect } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export default function ResetPassword() {
  const { isAuthenticated, updatePassword } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ password: false, confirmPassword: false });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Check if we have the required tokens from the URL
  const accessToken = searchParams.get('access_token');
  const refreshToken = searchParams.get('refresh_token');

  useEffect(() => {
    // If no tokens, redirect to auth page
    if (!accessToken || !refreshToken) {
      toast({
        title: "Link inválido",
        description: t('auth.messages.resetLinkInvalid'),
        variant: "destructive",
      });
      navigate('/auth');
    }
  }, [accessToken, refreshToken, navigate, toast, t]);

  // If user is already authenticated (but came from reset link), allow password change
  if (isAuthenticated && !accessToken) {
    return <Navigate to="/dashboard" replace />;
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
    
    const { error } = await updatePassword(form.password);
    
    if (error) {
      toast({
        title: "Erro ao redefinir senha",
        description: error.includes("expired") 
          ? t('auth.messages.resetLinkExpired')
          : error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Senha redefinida!",
        description: t('auth.messages.resetPasswordSuccess'),
      });
      
      // Redirect to login page after success
      setTimeout(() => {
        navigate('/auth');
      }, 2000);
    }
    
    setLoading(false);
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
            {t('auth.resetPassword')}
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
                {t('auth.resetPassword')}
              </CardTitle>
              <CardDescription>
                Digite sua nova senha. Ela deve ter pelo menos 8 caracteres com maiúscula, minúscula e número.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.fields.newPassword')}</Label>
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
                <Label htmlFor="confirmPassword">{t('auth.fields.confirmPassword')}</Label>
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
                {t('auth.resetPassword')}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
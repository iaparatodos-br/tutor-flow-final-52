import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraduationCap, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export default function Auth() {
  const { isAuthenticated, signIn, signUp, resetPassword } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({ name: "", email: "", password: "" });
  const [resetForm, setResetForm] = useState({ email: "" });
  const [loading, setLoading] = useState(false);
  const [loginErrors, setLoginErrors] = useState({ email: false, password: false });
  const [signupErrors, setSignupErrors] = useState({ name: false, email: false, password: false });
  const [resetErrors, setResetErrors] = useState({ email: false });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [currentTab, setCurrentTab] = useState("login");

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Enhanced validation
    const errors = {
      email: !loginForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginForm.email),
      password: !loginForm.password
    };
    setLoginErrors(errors);
    
    if (Object.values(errors).some(Boolean)) {
      return;
    }
    
    setLoading(true);
    
    const { error } = await signIn(loginForm.email, loginForm.password);
    
    if (error) {
      toast({
        title: "Erro ao fazer login",
        description: error.message === "Invalid login credentials" 
          ? "E-mail ou senha incorretos" 
          : error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Login realizado com sucesso!",
        description: "Bem-vindo ao TutorFlow",
      });
    }
    
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Enhanced validation with security requirements
    const errors = {
      name: !signupForm.name || signupForm.name.trim().length < 2,
      email: !signupForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupForm.email),
      password: !signupForm.password || 
                signupForm.password.length < 8 ||
                !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(signupForm.password),
    };
    setSignupErrors(errors);
    
    if (Object.values(errors).some(Boolean)) {
      return;
    }
    
    setLoading(true);
    
    // Chama signUp SEM passar role (AuthContext já define o default como 'professor')
    const { error } = await signUp(signupForm.email, signupForm.password, signupForm.name);
    
    if (error) {
      toast({
        title: "Erro ao criar conta",
        description: error.includes("já está sendo usado") 
          ? error
          : error === "User already registered" 
          ? "Este e-mail já está registrado" 
          : error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Conta criada com sucesso!",
        description: "Você já pode fazer login",
      });
    }
    
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const errors = {
      email: !resetForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetForm.email)
    };
    setResetErrors(errors);
    
    if (Object.values(errors).some(Boolean)) {
      return;
    }
    
    setLoading(true);
    
    const { error } = await resetPassword(resetForm.email);
    
    if (error) {
      toast({
        title: "Erro ao enviar email",
        description: error.includes("not found") 
          ? t('auth.messages.emailNotFound')
          : error,
        variant: "destructive",
      });
    } else {
      toast({
        title: t('auth.messages.resetEmailSent'),
        description: t('auth.messages.resetEmailSentDescription'),
      });
      
      // Switch back to login tab after success
      setCurrentTab("login");
    }
    
    setLoading(false);
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
            Gerencie suas aulas e alunos com facilidade
          </p>
        </div>

        <Card className="shadow-card">
          <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Registrar</TabsTrigger>
              <TabsTrigger value="reset">Recuperar</TabsTrigger>
            </TabsList>
            
            {/* Login Tab */}
            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardHeader>
                  <CardTitle>Fazer Login</CardTitle>
                  <CardDescription>
                    Entre com sua conta para acessar a plataforma
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginForm.email}
                      onChange={(e) => {
                        setLoginForm(prev => ({ ...prev, email: e.target.value }));
                        setLoginErrors(prev => ({ ...prev, email: false }));
                      }}
                      className={loginErrors.email ? "border-destructive" : ""}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="Sua senha"
                        value={loginForm.password}
                        onChange={(e) => {
                          setLoginForm(prev => ({ ...prev, password: e.target.value }));
                          setLoginErrors(prev => ({ ...prev, password: false }));
                        }}
                        className={loginErrors.password ? "border-destructive pr-10" : "pr-10"}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                      >
                        {showLoginPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-primary hover:bg-primary-hover shadow-primary"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Entrar
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>

            {/* Signup Tab */}
            <TabsContent value="signup">
              <form onSubmit={handleSignup}>
                <CardHeader>
                  <CardTitle>Criar Conta</CardTitle>
                  <CardDescription>
                    Registre-se na plataforma TutorFlow
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nome completo</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Seu nome completo"
                      value={signupForm.name}
                      onChange={(e) => {
                        setSignupForm(prev => ({ ...prev, name: e.target.value }));
                        setSignupErrors(prev => ({ ...prev, name: false }));
                      }}
                      className={signupErrors.name ? "border-destructive" : ""}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={signupForm.email}
                      onChange={(e) => {
                        setSignupForm(prev => ({ ...prev, email: e.target.value }));
                        setSignupErrors(prev => ({ ...prev, email: false }));
                      }}
                      className={signupErrors.email ? "border-destructive" : ""}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showSignupPassword ? "text" : "password"}
                        placeholder="Mínimo 8 caracteres com maiúscula, minúscula e número"
                        value={signupForm.password}
                        onChange={(e) => {
                          setSignupForm(prev => ({ ...prev, password: e.target.value }));
                          setSignupErrors(prev => ({ ...prev, password: false }));
                        }}
                        className={signupErrors.password ? "border-destructive pr-10" : "pr-10"}
                        required
                        minLength={8}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowSignupPassword(!showSignupPassword)}
                      >
                        {showSignupPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-success hover:bg-success shadow-success"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Criar Conta
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>

            {/* Reset Password Tab */}
            <TabsContent value="reset">
              <form onSubmit={handleResetPassword}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentTab("login")}
                      className="p-1 h-auto"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    {t('auth.forgotPassword')}
                  </CardTitle>
                  <CardDescription>
                    Digite seu email para receber um link de recuperação de senha
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">{t('auth.fields.email')}</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder={t('auth.placeholders.email')}
                      value={resetForm.email}
                      onChange={(e) => {
                        setResetForm(prev => ({ ...prev, email: e.target.value }));
                        setResetErrors(prev => ({ ...prev, email: false }));
                      }}
                      className={resetErrors.email ? "border-destructive" : ""}
                      required
                    />
                    {resetErrors.email && (
                      <p className="text-sm text-destructive">
                        Digite um email válido
                      </p>
                    )}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-primary hover:bg-primary-hover shadow-primary"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('auth.sendResetEmail')}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

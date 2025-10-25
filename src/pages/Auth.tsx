import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraduationCap, Loader2, Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Auth() {
  const { isAuthenticated, isProfessor, isAluno, signIn, signUp, resetPassword, resendConfirmation } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation('auth');
  
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({ name: "", email: "", password: "", termsAccepted: false });
  const [resetForm, setResetForm] = useState({ email: "" });
  const [loading, setLoading] = useState(false);
  const [loginErrors, setLoginErrors] = useState({ email: false, password: false });
  const [signupErrors, setSignupErrors] = useState({ name: false, email: false, password: false, termsAccepted: false });
  const [resetErrors, setResetErrors] = useState({ email: false });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [currentTab, setCurrentTab] = useState("login");
  const [showResetForm, setShowResetForm] = useState(false);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState<string | null>(null);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);

  if (isAuthenticated) {
    // Redirecionar baseado no papel do usuário
    if (isProfessor) {
      return <Navigate to="/dashboard" replace />;
    } else if (isAluno) {
      return <Navigate to="/portal-do-aluno" replace />;
    }
    // Fallback para dashboard se o papel não for identificado
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
      // Check if error is related to email not confirmed
      if (error.message?.includes('Email not confirmed') || error.message?.includes('email_not_confirmed')) {
        setEmailNotConfirmed(loginForm.email);
        toast({
          title: t('messages.emailNotConfirmed'),
          description: t('messages.emailNotConfirmedDescription'),
          variant: "destructive",
        });
      } else {
        setEmailNotConfirmed(null);
        toast({
          title: t('messages.loginError'),
          description: error.message === "Invalid login credentials" 
            ? t('messages.incorrectCredentials')
            : error.message,
          variant: "destructive",
        });
      }
    } else {
      setEmailNotConfirmed(null);
      toast({
        title: t('messages.loginSuccess'),
        description: t('messages.welcomeBack'),
      });
    }
    
    setLoading(false);
  };

  const handleResendConfirmation = async () => {
    if (!emailNotConfirmed) return;
    
    setResendingConfirmation(true);
    
    const { error } = await resendConfirmation(emailNotConfirmed);
    
    if (error) {
      toast({
        title: t('messages.confirmationResentError'),
        description: error.message || t('messages.confirmationResentErrorDescription'),
        variant: "destructive",
      });
    } else {
      toast({
        title: t('messages.confirmationResentTitle'),
        description: t('messages.confirmationResentDescription'),
      });
      setEmailNotConfirmed(null);
    }
    
    setResendingConfirmation(false);
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
      termsAccepted: !signupForm.termsAccepted
    };
    setSignupErrors(errors);
    
    if (Object.values(errors).some(Boolean)) {
      return;
    }
    
    setLoading(true);
    
    // Capturar informações para auditoria legal
    const userAgent = navigator.userAgent;
    const termsVersion = "v1.0-2025-10-25";
    const privacyVersion = "v1.0-2025-10-25";
    
    const { error } = await signUp(
      signupForm.email, 
      signupForm.password, 
      signupForm.name,
      undefined,
      {
        terms_version: termsVersion,
        privacy_policy_version: privacyVersion,
        user_agent: userAgent,
        ip_address: null
      }
    );
    
    if (error) {
      toast({
        title: t('messages.signupError'),
        description: error.includes("já está sendo usado") 
          ? error
          : error === "User already registered" 
          ? t('messages.emailInUse')
          : error,
        variant: "destructive",
      });
    } else {
      toast({
        title: t('messages.emailVerificationRequired'),
        description: t('messages.emailVerificationDescription'),
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
        title: t('messages.resetEmailError'),
        description: error.includes("not found") 
          ? t('messages.emailNotFound')
          : error,
        variant: "destructive",
      });
    } else {
      toast({
        title: t('messages.resetEmailSent'),
        description: t('messages.resetEmailSentDescription'),
      });
      
      // Switch back to login form after success
      setShowResetForm(false);
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
            {t('ui.tagline')}
          </p>
        </div>

        <Card className="shadow-card">
          <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{t('login')}</TabsTrigger>
              <TabsTrigger value="signup">{t('register')}</TabsTrigger>
            </TabsList>
            
            {/* Login Tab */}
            <TabsContent value="login">
              {!showResetForm ? (
                <form onSubmit={handleLogin}>
                  <CardHeader>
                    <CardTitle>{t('ui.loginTitle')}</CardTitle>
                    <CardDescription>
                      {t('ui.loginDescription')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">{t('fields.email')}</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder={t('placeholders.email')}
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
                      <Label htmlFor="login-password">{t('fields.password')}</Label>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showLoginPassword ? "text" : "password"}
                          placeholder={t('placeholders.password')}
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
                      <div className="text-right">
                        <Button
                          type="button"
                          variant="link"
                          className="px-0 font-normal text-sm text-muted-foreground hover:text-primary"
                          onClick={() => setShowResetForm(true)}
                        >
                          {t('forgotPassword')}
                        </Button>
                      </div>
                     </div>
                   </CardContent>
                   <CardFooter className="flex-col gap-3">
                     {emailNotConfirmed && (
                       <Alert className="w-full mb-3">
                         <Mail className="h-4 w-4" />
                         <AlertDescription className="flex flex-col gap-2">
                           <span className="text-sm">
                             {t('ui.emailNotConfirmedAlert')}
                           </span>
                           <Button
                             type="button"
                             variant="outline"
                             size="sm"
                             onClick={handleResendConfirmation}
                             disabled={resendingConfirmation}
                             className="w-full"
                           >
                             {resendingConfirmation && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                             {t('ui.resendConfirmation')}
                           </Button>
                         </AlertDescription>
                       </Alert>
                     )}
                     <Button 
                      type="submit" 
                      className="w-full bg-gradient-primary hover:bg-primary-hover shadow-primary"
                      disabled={loading}
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('ui.enterButton')}
                    </Button>
                   </CardFooter>
                 </form>
              ) : (
                <form onSubmit={handleResetPassword}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowResetForm(false)}
                        className="p-1 h-auto"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      {t('forgotPassword')}
                    </CardTitle>
                    <CardDescription>
                      {t('resetPasswordDescription')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reset-email">{t('fields.email')}</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder={t('placeholders.email')}
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
                          {t('validation.invalidEmail')}
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
                      {t('sendResetEmail')}
                    </Button>
                  </CardFooter>
                </form>
              )}
            </TabsContent>

            {/* Signup Tab */}
            <TabsContent value="signup">
              <form onSubmit={handleSignup}>
                <CardHeader>
                  <CardTitle>{t('ui.signupTitle')}</CardTitle>
                  <CardDescription>
                    {t('ui.signupDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">{t('fields.name')}</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder={t('placeholders.name')}
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
                    <Label htmlFor="signup-email">{t('fields.email')}</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder={t('placeholders.email')}
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
                    <Label htmlFor="signup-password">{t('fields.password')}</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showSignupPassword ? "text" : "password"}
                        placeholder={t('placeholders.password')}
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
                  
                  {/* Checkbox de aceite de termos */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id="terms-acceptance"
                        checked={signupForm.termsAccepted}
                        onChange={(e) => {
                          setSignupForm(prev => ({ ...prev, termsAccepted: e.target.checked }));
                          setSignupErrors(prev => ({ ...prev, termsAccepted: false }));
                        }}
                        className={`mt-0.5 h-4 w-4 rounded border ${signupErrors.termsAccepted ? 'border-destructive' : 'border-input'}`}
                      />
                      <Label 
                        htmlFor="terms-acceptance" 
                        className="text-sm leading-tight cursor-pointer"
                      >
                        {t('terms.checkboxLabel').split('{{')[0]}
                        <a 
                          href="/termos-de-uso" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-medium"
                        >
                          {t('terms.termsOfService')}
                        </a>
                        {' '}{t('terms.checkboxLabel').includes('{{privacyLink}}') ? 'e a' : 'and'}{' '}
                        <a 
                          href="/politica-de-privacidade" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-medium"
                        >
                          {t('terms.privacyPolicy')}
                        </a>
                      </Label>
                    </div>
                    {signupErrors.termsAccepted && (
                      <p className="text-sm text-destructive">
                        {t('terms.required')}
                      </p>
                    )}
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
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'professor' | 'aluno';
  teacher_id?: string;
  password_changed?: boolean;
  cpf?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal_code?: string | null;
  address_complete?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  isProfessor: boolean;
  isAluno: boolean;
  needsPasswordChange: boolean;
  needsAddressInfo: boolean;
  signUp: (email: string, password: string, name: string, role?: 'professor' | 'aluno') => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (password: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cache do perfil com timestamp para evitar consultas desnecessárias
const profileCache = new Map<string, { profile: Profile; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Sistema de proteção contra carregamento infinito
const loadingTracker = new Map<string, { isLoading: boolean; attempts: number; lastAttempt: number }>();
const MAX_LOADING_ATTEMPTS = 3;
const LOADING_TIMEOUT = 10000; // 10 segundos
const RETRY_COOLDOWN = 5000; // 5 segundos entre tentativas

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const initialized = useRef(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout>();

  const loadProfile = useCallback(async (user: User): Promise<Profile | null> => {
    const userId = user.id;
    const now = Date.now();
    
    // Verificar se já está carregando e aplicar proteções
    const tracker = loadingTracker.get(userId) || { isLoading: false, attempts: 0, lastAttempt: 0 };
    
    // Se já está carregando, aguardar ou cancelar
    if (tracker.isLoading) {
      console.log('AuthProvider: Carregamento já em progresso, ignorando nova tentativa');
      return null;
    }
    
    // Verificar se excedeu número máximo de tentativas
    if (tracker.attempts >= MAX_LOADING_ATTEMPTS) {
      if (now - tracker.lastAttempt < RETRY_COOLDOWN) {
        console.log('AuthProvider: Muitas tentativas, aguardando cooldown');
        return null;
      }
      // Reset após cooldown
      tracker.attempts = 0;
    }

    // Marcar como carregando
    tracker.isLoading = true;
    tracker.attempts += 1;
    tracker.lastAttempt = now;
    loadingTracker.set(userId, tracker);

    try {
      console.log('AuthProvider: Carregando perfil do usuário', { 
        userId, 
        email: user.email, 
        attempt: tracker.attempts 
      });
      
      // Verificar cache primeiro
      const cached = profileCache.get(userId);
      if (cached && now - cached.timestamp < CACHE_DURATION) {
        console.log('AuthProvider: Perfil encontrado no cache');
        tracker.isLoading = false;
        loadingTracker.set(userId, tracker);
        return cached.profile;
      }

      // Timeout de segurança
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Profile loading timeout')), LOADING_TIMEOUT);
      });

      // Buscar perfil no Supabase com timeout
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const { data: existingProfile, error: fetchError } = await Promise.race([
        profilePromise,
        timeoutPromise
      ]);

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('AuthProvider: Erro ao buscar perfil:', fetchError);
        throw fetchError;
      }

      let profile: Profile;

      if (existingProfile) {
        console.log('AuthProvider: Perfil existente encontrado');
        profile = {
          id: existingProfile.id,
          name: existingProfile.name || user.email?.split('@')[0] || 'Usuário',
          email: user.email || '',
          role: (existingProfile.role as 'professor' | 'aluno') || 'professor',
          password_changed: existingProfile.password_changed,
          cpf: existingProfile.cpf,
          address_street: existingProfile.address_street,
          address_city: existingProfile.address_city,
          address_state: existingProfile.address_state,
          address_postal_code: existingProfile.address_postal_code,
          address_complete: existingProfile.address_complete
        };
      } else {
        // Criar perfil se não existir
        console.log('AuthProvider: Criando novo perfil');
        const newProfile = {
          id: userId,
          name: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
          email: user.email || '',
          role: 'professor' as const
        };

        const createPromise = supabase
          .from('profiles')
          .insert(newProfile)
          .select()
          .single();

        const { data: createdProfile, error: createError } = await Promise.race([
          createPromise,
          timeoutPromise
        ]);

        if (createError) {
          console.error('AuthProvider: Erro ao criar perfil:', createError);
          throw createError;
        }

        profile = {
          id: createdProfile.id,
          name: createdProfile.name,
          email: createdProfile.email,
          role: createdProfile.role as 'professor' | 'aluno',
          password_changed: createdProfile.password_changed,
          cpf: createdProfile.cpf,
          address_street: createdProfile.address_street,
          address_city: createdProfile.address_city,
          address_state: createdProfile.address_state,
          address_postal_code: createdProfile.address_postal_code,
          address_complete: createdProfile.address_complete
        };

        console.log('AuthProvider: Perfil criado com sucesso');
      }

      // Atualizar cache
      profileCache.set(userId, { profile, timestamp: now });
      
      // Marcar como não carregando mais
      tracker.isLoading = false;
      tracker.attempts = 0; // Reset attempts on success
      loadingTracker.set(userId, tracker);
      
      return profile;
    } catch (error) {
      console.error('AuthProvider: Erro no loadProfile:', error);
      
      // Marcar como não carregando mais
      tracker.isLoading = false;
      loadingTracker.set(userId, tracker);
      
      return null;
    }
  }, []);

  useEffect(() => {
    if (initialized.current) {
      console.log('AuthProvider: Já inicializado, ignorando');
      return;
    }
    
    console.log('AuthProvider: Inicializando contexto de autenticação');
    initialized.current = true;

    // Timeout de segurança para loading infinito
    const setupLoadingTimeout = () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      
      loadingTimeoutRef.current = setTimeout(() => {
        console.warn('AuthProvider: Loading timeout atingido, forçando fim do loading');
        setLoading(false);
        setProfileLoading(false);
      }, LOADING_TIMEOUT);
    };

    // Configurar listener de mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // **A MUDANÇA ARQUITETURAL CHAVE ESTÁ AQUI:**
      // Se o evento é de recuperação de senha, o AuthProvider não deve fazer nada.
      // Isso previne o carregamento do perfil e a race condition.
      // O listener em App.tsx cuidará da navegação para /reset-password.
      if (event === 'PASSWORD_RECOVERY') {
        console.log('AuthProvider: Password recovery detected, skipping auth processing');
        return;
      }
      
      console.log('AuthProvider: Estado de autenticação mudou', { event, hasSession: !!session });
      
      
      // Limpar timeout anterior
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      
      setSession(session);
      setUser(session?.user || null);

      if (session?.user) {
        setupLoadingTimeout();
        setProfileLoading(true);
        
        // Usar setTimeout para evitar problemas de concorrência
        setTimeout(async () => {
          try {
            const userProfile = await loadProfile(session.user);
            setProfile(userProfile);
          } catch (error) {
            console.error('AuthProvider: Erro ao carregar perfil no onAuthStateChange:', error);
            setProfile(null);
          } finally {
            setProfileLoading(false);
            setLoading(false);
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
            }
          }
        }, 0);
      } else {
        setProfile(null);
        setProfileLoading(false);
        setLoading(false);
      }
    });

    // Verificar sessão existente apenas uma vez
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('AuthProvider: Verificando sessão existente', { hasSession: !!session });
      
      setSession(session);
      setUser(session?.user || null);
      
      if (session?.user) {
        setupLoadingTimeout();
        setProfileLoading(true);
        
        try {
          const userProfile = await loadProfile(session.user);
          setProfile(userProfile);
        } catch (error) {
          console.error('AuthProvider: Erro ao carregar perfil na inicialização:', error);
          setProfile(null);
        } finally {
          setProfileLoading(false);
          setLoading(false);
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }
        }
      } else {
        setLoading(false);
      }
    });

    return () => {
      console.log('AuthProvider: Limpando listeners');
      subscription.unsubscribe();
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [loadProfile]);

  const signUp = async (email: string, password: string, name: string, role: 'professor' | 'aluno' = 'professor') => {
    try {
      setLoading(true);
      
      // Check if email is already in use
      const { data: checkResult, error: checkError } = await supabase.functions.invoke('check-email-availability', {
        body: { email }
      });

      if (checkError) {
        console.error('Error checking email availability:', checkError);
        return { error: 'Erro ao verificar disponibilidade do e-mail' };
      }

      if (!checkResult.available) {
        return { error: 'Este e-mail já está sendo usado por outro usuário. Por favor, use um e-mail diferente para criar sua conta.' };
      }

      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            name,
            role
          }
        }
      });
      
      return { error: error?.message };
    } catch (error) {
      console.error('Signup error:', error);
      return { error: 'Erro inesperado durante o cadastro' };
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    return { error };
  };

  const signOut = async () => {
    try {
      // Limpar cache e tracker ao fazer logout
      if (user?.id) {
        profileCache.delete(user.id);
        loadingTracker.delete(user.id);
      }
      
      // Limpar timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      
      // Tentar fazer logout no servidor
      await supabase.auth.signOut();
    } catch (error) {
      // Se falhar (ex: sessão já expirada), apenas log o erro
      // O estado local será limpo pelo onAuthStateChange
      console.warn('AuthProvider: Erro no logout do servidor (provavelmente sessão já expirada):', error);
    }
    
    // Forçar limpeza do estado local independente do resultado do servidor
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const resetPassword = async (email: string) => {
    try {
      // Ensure the redirect URL is exactly what we want
      const redirectUrl = `${window.location.protocol}//${window.location.host}/reset-password`;
      
      console.log('AuthContext: Sending reset password email with redirect to:', redirectUrl);
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      });
      
      return { error: error?.message };
    } catch (error) {
      console.error('Reset password error:', error);
      return { error: 'Erro inesperado ao solicitar redefinição de senha' };
    }
  };

  const updatePassword = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      return { error: error?.message };
    } catch (error) {
      console.error('Update password error:', error);
      return { error: 'Erro inesperado ao atualizar senha' };
    }
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    loading: loading || profileLoading,
    isAuthenticated: !!user && !!session,
    isProfessor: !!profile && profile.role === 'professor',
    isAluno: !!profile && profile.role === 'aluno',
    needsPasswordChange: !!profile && profile.role === 'aluno' && profile.password_changed === false,
    needsAddressInfo: !!profile && !profile.address_complete,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
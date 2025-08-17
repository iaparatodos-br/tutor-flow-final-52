import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'professor' | 'aluno';
  teacher_id?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  isProfessor: boolean;
  isAluno: boolean;
  signUp: (email: string, password: string, name: string, role?: 'professor' | 'aluno') => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cache do perfil com timestamp para evitar consultas desnecessárias
const profileCache = new Map<string, { profile: Profile; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  const loadProfile = useCallback(async (user: User): Promise<Profile | null> => {
    try {
      console.log('AuthProvider: Carregando perfil do usuário', { userId: user.id, email: user.email });
      
      // Verificar cache primeiro
      const cached = profileCache.get(user.id);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('AuthProvider: Perfil encontrado no cache');
        return cached.profile;
      }

      // Buscar perfil no Supabase
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('AuthProvider: Erro ao buscar perfil:', fetchError);
        throw fetchError;
      }

      if (existingProfile) {
        console.log('AuthProvider: Perfil existente encontrado');
        const profile: Profile = {
          id: existingProfile.id,
          name: existingProfile.name || user.email?.split('@')[0] || 'Usuário',
          email: user.email || '',
          role: (existingProfile.role as 'professor' | 'aluno') || 'professor',
          teacher_id: existingProfile.teacher_id
        };
        
        // Atualizar cache
        profileCache.set(user.id, { profile, timestamp: Date.now() });
        return profile;
      }

      // Criar perfil se não existir
      console.log('AuthProvider: Criando novo perfil');
      const newProfile = {
        id: user.id,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
        email: user.email || '',
        role: 'professor' as const
      };

      const { data: createdProfile, error: createError } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select()
        .single();

      if (createError) {
        console.error('AuthProvider: Erro ao criar perfil:', createError);
        throw createError;
      }

      const profile: Profile = {
        id: createdProfile.id,
        name: createdProfile.name,
        email: createdProfile.email,
        role: createdProfile.role as 'professor' | 'aluno',
        teacher_id: createdProfile.teacher_id
      };

      // Atualizar cache
      profileCache.set(user.id, { profile, timestamp: Date.now() });
      console.log('AuthProvider: Perfil criado com sucesso');
      return profile;
    } catch (error) {
      console.error('AuthProvider: Erro no loadProfile:', error);
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

    // Configurar listener de mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('AuthProvider: Estado de autenticação mudou', { event, hasSession: !!session });
      
      setSession(session);
      setUser(session?.user || null);

      if (session?.user) {
        const userProfile = await loadProfile(session.user);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    // Verificar sessão existente apenas uma vez
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('AuthProvider: Verificando sessão existente', { hasSession: !!session });
      
      setSession(session);
      setUser(session?.user || null);
      
      if (session?.user) {
        loadProfile(session.user).then(setProfile);
      } else {
        setLoading(false);
      }
    });

    return () => {
      console.log('AuthProvider: Limpando listeners');
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = async (email: string, password: string, name: string, role: 'professor' | 'aluno' = 'professor') => {
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

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    return { error };
  };

  const signOut = async () => {
    // Limpar cache ao fazer logout
    if (user?.id) {
      profileCache.delete(user.id);
    }
    
    await supabase.auth.signOut();
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    loading,
    isAuthenticated: !!user && !!session,
    isProfessor: profile?.role === 'professor',
    isAluno: profile?.role === 'aluno',
    signUp,
    signIn,
    signOut
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
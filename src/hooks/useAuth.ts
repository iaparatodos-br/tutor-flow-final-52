import { useState, useEffect, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'professor' | 'aluno';
  teacher_id: string | null;
}

// Cache para evitar consultas duplicadas
const profileCache = new Map<string, Profile>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const isLoadingProfile = useRef(false);

  useEffect(() => {
    console.log('useAuth: Iniciando verificação de autenticação');
    
    // Configurar listener de mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('useAuth: Auth state changed', { event, hasSession: !!session });
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await loadProfile(session.user);
        } else {
          console.log('useAuth: Usuário deslogado');
          setProfile(null);
          setLoading(false);
        }
      }
    );

    // Verificar sessão existente
    console.log('useAuth: Verificando sessão existente');
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('useAuth: Sessão atual', { hasSession: !!session });
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await loadProfile(session.user);
      } else {
        console.log('useAuth: Nenhuma sessão existente, finalizando loading');
        setLoading(false);
      }
    }).catch((error) => {
      console.error('useAuth: Erro ao verificar sessão:', error);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (user: User) => {
    if (isLoadingProfile.current) {
      console.log('useAuth: Já carregando perfil, pulando...');
      return;
    }
    
    isLoadingProfile.current = true;
    
    try {
      console.log('useAuth: Buscando perfil do usuário', { userId: user.id, email: user.email });
      
      // Verificar cache primeiro
      const cacheKey = user.id;
      const cached = profileCache.get(cacheKey);
      if (cached) {
        console.log('useAuth: Perfil encontrado no cache', cached);
        setProfile(cached);
        setLoading(false);
        isLoadingProfile.current = false;
        return;
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      console.log('useAuth: Resultado da query', { data, error });
      
      if (!error && data) {
        console.log('useAuth: Perfil encontrado com sucesso', data);
        const profileData = data as Profile;
        profileCache.set(cacheKey, profileData);
        setProfile(profileData);
      } else {
        console.log('useAuth: Perfil não encontrado, criando perfil básico', { error });
        // Criar perfil básico se não existir
        const basicProfile = {
          id: user.id,
          name: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
          email: user.email || '',
          role: 'professor' as const,
          teacher_id: null
        };
        console.log('useAuth: Definindo perfil básico', basicProfile);
        profileCache.set(cacheKey, basicProfile);
        setProfile(basicProfile);
      }
    } catch (error) {
      console.error('useAuth: Erro na busca do perfil:', error);
      // Criar perfil básico se houver erro
      const basicProfile = {
        id: user.id,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
        email: user.email || '',
        role: 'professor' as const,
        teacher_id: null
      };
      console.log('useAuth: Definindo perfil básico após erro', basicProfile);
      profileCache.set(user.id, basicProfile);
      setProfile(basicProfile);
    } finally {
      console.log('useAuth: Finalizando loading');
      setLoading(false);
      isLoadingProfile.current = false;
    }
  };

  const signUp = async (email: string, password: string, name: string, role: 'professor' | 'aluno' = 'professor') => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
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
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    isAuthenticated: !!user,
    isProfessor: profile?.role === 'professor',
    isAluno: profile?.role === 'aluno'
  };
};
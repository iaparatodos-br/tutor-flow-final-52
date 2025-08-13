import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'professor' | 'aluno';
  teacher_id: string | null;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('useAuth: Iniciando verificação de autenticação');
    
    // Configurar listener de mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('useAuth: Auth state changed', { event, hasSession: !!session });
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Buscar perfil do usuário com timeout
          try {
            console.log('useAuth: Buscando perfil do usuário', { userId: session.user.id, email: session.user.email });
            
            // Criar uma Promise com timeout para evitar espera infinita
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Profile query timeout')), 5000);
            });
            
            const queryPromise = supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
            
            const result = await Promise.race([queryPromise, timeoutPromise]);
            const { data, error } = result as any;
            
            console.log('useAuth: Resultado da query', { data, error, hasSession: !!session });
            
            if (!error && data) {
              console.log('useAuth: Perfil encontrado com sucesso', data);
              setProfile(data as Profile);
            } else {
              console.log('useAuth: Perfil não encontrado ou erro, criando perfil básico', { error, hasData: !!data });
              // Criar perfil básico se não existir
              const basicProfile = {
                id: session.user.id,
                name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuário',
                email: session.user.email || '',
                role: 'professor' as const,
                teacher_id: null
              };
              console.log('useAuth: Definindo perfil básico', basicProfile);
              setProfile(basicProfile);
            }
          } catch (error) {
            console.error('useAuth: Erro na busca do perfil (catch):', error);
            // Criar perfil básico se houver erro ou timeout
            const basicProfile = {
              id: session.user.id,
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuário',
              email: session.user.email || '',
              role: 'professor' as const,
              teacher_id: null
            };
            console.log('useAuth: Definindo perfil básico após erro/timeout', basicProfile);
            setProfile(basicProfile);
          } finally {
            console.log('useAuth: Finalizando loading do listener');
            setLoading(false);
          }
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
        console.log('useAuth: Buscando perfil para sessão existente', { userId: session.user.id, email: session.user.email });
        try {
          // Criar uma Promise com timeout para evitar espera infinita
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Profile query timeout')), 5000);
          });
          
          const queryPromise = supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          
          const result = await Promise.race([queryPromise, timeoutPromise]);
          const { data, error } = result as any;
          
          console.log('useAuth: Resultado da query inicial', { data, error, hasSession: !!session });
          
          if (!error && data) {
            console.log('useAuth: Perfil carregado para sessão existente', data);
            setProfile(data as Profile);
          } else {
            console.log('useAuth: Erro ao carregar perfil para sessão existente, criando básico', { error, hasData: !!data });
            // Criar perfil básico se não existir
            const basicProfile = {
              id: session.user.id,
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuário',
              email: session.user.email || '',
              role: 'professor' as const,
              teacher_id: null
            };
            console.log('useAuth: Definindo perfil básico inicial', basicProfile);
            setProfile(basicProfile);
          }
        } catch (error) {
          console.error('useAuth: Erro na busca do perfil inicial (catch/timeout):', error);
          // Criar perfil básico se houver erro ou timeout
          const basicProfile = {
            id: session.user.id,
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuário',
            email: session.user.email || '',
            role: 'professor' as const,
            teacher_id: null
          };
          console.log('useAuth: Definindo perfil básico após erro/timeout inicial', basicProfile);
          setProfile(basicProfile);
        } finally {
          console.log('useAuth: Finalizando loading inicial');
          setLoading(false);
        }
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
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
          // Buscar perfil do usuário
          try {
            console.log('useAuth: Buscando perfil do usuário');
            const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
            
            if (!error && data) {
              console.log('useAuth: Perfil encontrado', data);
              setProfile(data as Profile);
            } else {
              console.log('useAuth: Perfil não encontrado ou erro', error);
            }
            setLoading(false);
          } catch (error) {
            console.error('Erro ao buscar perfil:', error);
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
        console.log('useAuth: Buscando perfil para sessão existente');
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          
          if (!error && data) {
            console.log('useAuth: Perfil carregado para sessão existente', data);
            setProfile(data as Profile);
          } else {
            console.log('useAuth: Erro ao carregar perfil para sessão existente', error);
          }
          setLoading(false);
        } catch (error) {
          console.error('useAuth: Erro na busca do perfil:', error);
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
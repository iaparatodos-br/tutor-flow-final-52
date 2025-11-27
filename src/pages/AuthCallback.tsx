import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      console.log('AuthCallback: Processando callback de autenticação');
      
      try {
        // Verificar se há parâmetros de erro na URL
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        
        if (errorParam) {
          console.error('AuthCallback: Erro nos parâmetros:', errorParam, errorDescription);
          setError(errorDescription || errorParam);
          setProcessing(false);
          return;
        }

        // CORREÇÃO: Detectar tokens de query params e hash
        let accessToken = searchParams.get('access_token');
        let refreshToken = searchParams.get('refresh_token');
        let type = searchParams.get('type');
        
        // Se não encontrar nos query params, tentar no hash
        if (!accessToken && window.location.hash) {
          const hash = window.location.hash.substring(1);
          const hashParams = new URLSearchParams(hash);
          accessToken = hashParams.get('access_token');
          refreshToken = hashParams.get('refresh_token');
          type = hashParams.get('type');
          console.log('AuthCallback: Tokens encontrados no hash');
        }

        console.log('AuthCallback: Tipo de callback:', type);

        // CORREÇÃO: Se for recuperação de senha, redirecionar para reset-password
        if (type === 'recovery' && accessToken && refreshToken) {
          console.log('🔑 AuthCallback: Redirecionando para reset-password com tokens');
          
          // Preservar todos os tokens na URL
          const resetUrl = `/reset-password?access_token=${accessToken}&refresh_token=${refreshToken}&type=recovery`;
          navigate(resetUrl, { replace: true });
          return;
        }

        if (accessToken && refreshToken) {
          console.log('AuthCallback: Tokens encontrados, configurando sessão');
          
          // Configurar a sessão com os tokens recebidos
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            console.error('AuthCallback: Erro ao configurar sessão:', sessionError);
            setError('Erro ao processar o link de convite. Tente novamente.');
            setProcessing(false);
            return;
          }

          console.log('AuthCallback: Sessão configurada com sucesso');
          
          // Aguardar um pouco para o contexto de auth atualizar
          setTimeout(() => {
            setProcessing(false);
          }, 1000);
        } else {
          console.log('AuthCallback: Nenhum token encontrado, redirecionando');
          // Se não há tokens, redirecionar para auth
          navigate('/auth');
        }
      } catch (err) {
        console.error('AuthCallback: Erro inesperado:', err);
        setError('Erro inesperado ao processar o convite.');
        setProcessing(false);
      }
    };

    handleAuthCallback();
  }, [searchParams, navigate]);

  // Quando o usuário for autenticado e carregado, redirecionar
  useEffect(() => {
    if (!processing && user && profile) {
      console.log('AuthCallback: Usuário autenticado, redirecionando...', {
        userId: user.id,
        role: profile.role,
        addressComplete: profile.address_complete
      });
      
      // Redirecionar baseado no tipo de usuário
      if (profile.role === 'aluno') {
        console.log('AuthCallback: Redirecionando para portal do aluno');
        navigate('/portal-do-aluno');
      } else {
        console.log('AuthCallback: Redirecionando para dashboard');
        navigate('/dashboard');
      }
    }
  }, [processing, user, profile, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-subtle">
        <div className="w-full max-w-md rounded-lg bg-card p-8 shadow-lg">
          <div className="text-center">
            <div className="mb-4 text-red-500">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-semibold text-foreground">Erro no Convite</h1>
            <p className="mb-6 text-muted-foreground">{error}</p>
            <button
              onClick={() => navigate('/auth')}
              className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-subtle">
      <div className="w-full max-w-md rounded-lg bg-card p-8 shadow-lg">
        <div className="text-center">
          <div className="mb-4">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          </div>
          <h1 className="mb-2 text-xl font-semibold text-foreground">Processando Convite</h1>
          <p className="text-muted-foreground">
            {processing ? 'Configurando sua conta...' : 'Redirecionando...'}
          </p>
        </div>
      </div>
    </div>
  );
}
-- Criar tabela para armazenar dados temporários de business profiles
CREATE TABLE public.pending_business_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_name TEXT NOT NULL,
  cnpj TEXT,
  stripe_connect_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

-- Habilitar RLS
ALTER TABLE public.pending_business_profiles ENABLE ROW LEVEL SECURITY;

-- Política para usuários gerenciarem seus próprios pending profiles
CREATE POLICY "Users can manage their own pending business profiles"
ON public.pending_business_profiles
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Função para limpar registros expirados
CREATE OR REPLACE FUNCTION public.cleanup_expired_pending_profiles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  -- Deletar registros expirados
  DELETE FROM public.pending_business_profiles 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;
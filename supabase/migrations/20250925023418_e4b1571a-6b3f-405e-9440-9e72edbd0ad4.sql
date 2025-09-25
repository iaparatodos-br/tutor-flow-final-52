-- Solução definitiva para recursão infinita na tabela profiles
-- Problema: O trigger de auditoria na tabela profiles está causando recursão infinita
-- quando o AuthContext tenta carregar o perfil do usuário

-- Etapa 1: Remover o trigger de auditoria problemático da tabela profiles
DROP TRIGGER IF EXISTS audit_profiles_access ON public.profiles;

-- Etapa 2: Verificar se existe uma função de auditoria específica para profiles e removê-la se necessário
DROP FUNCTION IF EXISTS public.audit_profiles_access() CASCADE;

-- Etapa 3: Ajustar as políticas RLS da tabela security_audit_logs para evitar dependência de profiles
-- Primeiro, remover políticas que podem causar problemas
DROP POLICY IF EXISTS "Only admins can view security audit logs" ON public.security_audit_logs;
DROP POLICY IF EXISTS "System can insert security audit logs" ON public.security_audit_logs;

-- Recriar políticas mais simples para security_audit_logs
CREATE POLICY "system_insert_audit_logs" ON public.security_audit_logs
FOR INSERT WITH CHECK (true);

CREATE POLICY "users_view_own_audit_logs" ON public.security_audit_logs
FOR SELECT USING (user_id = auth.uid());

-- Etapa 4: Garantir que a função log_security_event não cause recursão
-- Recriar a função com proteção contra recursão
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_action text,
  p_resource_type text,
  p_resource_id uuid DEFAULT NULL::uuid,
  p_security_level text DEFAULT 'info'::text,
  p_details jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Inserir log de segurança sem consultar outras tabelas que podem causar recursão
  INSERT INTO public.security_audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    security_level,
    details
  ) VALUES (
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    p_security_level,
    p_details
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Silenciosamente ignorar erros para evitar interrupção do fluxo principal
    NULL;
END;
$$;
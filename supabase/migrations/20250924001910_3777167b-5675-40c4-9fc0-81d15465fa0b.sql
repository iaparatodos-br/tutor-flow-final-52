-- Fase 1: Correções de Segurança Críticas (Corrigida)

-- 1. Configurar proteção contra senhas vazadas
-- Criar função para validar força de senhas
CREATE OR REPLACE FUNCTION public.validate_password_strength(password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validar se a senha tem pelo menos 8 caracteres
  IF length(password) < 8 THEN
    RETURN false;
  END IF;
  
  -- Validar se contém pelo menos uma letra maiúscula
  IF password !~ '[A-Z]' THEN
    RETURN false;
  END IF;
  
  -- Validar se contém pelo menos uma letra minúscula
  IF password !~ '[a-z]' THEN
    RETURN false;
  END IF;
  
  -- Validar se contém pelo menos um número
  IF password !~ '[0-9]' THEN
    RETURN false;
  END IF;
  
  -- Validar se contém pelo menos um caractere especial
  IF password !~ '[!@#$%^&*(),.?":{}|<>]' THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- 2. Criar tabela para rastrear tentativas de login falhadas
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  ip_address INET,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN DEFAULT FALSE,
  user_agent TEXT
);

-- Habilitar RLS na tabela de tentativas de login
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Política para permitir inserção de tentativas de login
CREATE POLICY "Allow insert login attempts" ON public.login_attempts
  FOR INSERT 
  WITH CHECK (true);

-- Política para administradores visualizarem tentativas de login
CREATE POLICY "Admin can view login attempts" ON public.login_attempts
  FOR SELECT 
  USING (auth.uid() IN (
    SELECT id FROM public.profiles 
    WHERE role = 'admin'
  ));

-- 3. Função para registrar tentativas de login
CREATE OR REPLACE FUNCTION public.log_login_attempt(
  p_user_id UUID DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_success BOOLEAN DEFAULT FALSE,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.login_attempts (user_id, ip_address, attempted_at, success, user_agent)
  VALUES (p_user_id, p_ip_address, NOW(), p_success, p_user_agent);
END;
$$;

-- 4. Função para verificar se IP está bloqueado por muitas tentativas falhadas
CREATE OR REPLACE FUNCTION public.is_ip_blocked(p_ip_address INET)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  failed_attempts INTEGER;
BEGIN
  -- Contar tentativas falhadas nas últimas 15 minutos
  SELECT COUNT(*)
  INTO failed_attempts
  FROM public.login_attempts
  WHERE ip_address = p_ip_address
    AND success = false
    AND attempted_at > NOW() - INTERVAL '15 minutes';
  
  -- Bloquear se houver mais de 5 tentativas falhadas
  RETURN failed_attempts >= 5;
END;
$$;

-- 5. Criar índices para performance das consultas de segurança
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time 
ON public.login_attempts (ip_address, attempted_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user_time 
ON public.login_attempts (user_id, attempted_at);

-- 6. Trigger para limpeza automática de registros antigos de tentativas de login
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Remover registros de tentativas de login com mais de 30 dias
  DELETE FROM public.login_attempts
  WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$;

-- 7. Criar configurações de segurança adicionais
CREATE TABLE IF NOT EXISTS public.security_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_name TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Habilitar RLS na tabela de configurações de segurança
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;

-- Apenas administradores podem ver e modificar configurações de segurança
CREATE POLICY "Admin can manage security settings" ON public.security_settings
  FOR ALL 
  USING (auth.uid() IN (
    SELECT id FROM public.profiles 
    WHERE role = 'admin'
  ));

-- 8. Inserir configurações padrão de segurança
INSERT INTO public.security_settings (setting_name, setting_value) VALUES
  ('max_login_attempts', '5'),
  ('lockout_duration_minutes', '15'),
  ('password_min_length', '8'),
  ('require_password_change_days', '90'),
  ('session_timeout_minutes', '480')
ON CONFLICT (setting_name) DO NOTHING;

-- 9. Trigger para atualizar timestamp de configurações
CREATE OR REPLACE FUNCTION public.update_security_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_security_settings_timestamp
  BEFORE UPDATE ON public.security_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_security_settings_timestamp();
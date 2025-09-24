-- Correção dos avisos de segurança - search_path das funções

-- Corrigir funções com search_path
CREATE OR REPLACE FUNCTION public.validate_password_strength(password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

-- Corrigir função de registro de tentativas de login
CREATE OR REPLACE FUNCTION public.log_login_attempt(
  p_user_id UUID DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_success BOOLEAN DEFAULT FALSE,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.login_attempts (user_id, ip_address, attempted_at, success, user_agent)
  VALUES (p_user_id, p_ip_address, NOW(), p_success, p_user_agent);
END;
$$;

-- Corrigir função de verificação de IP bloqueado
CREATE OR REPLACE FUNCTION public.is_ip_blocked(p_ip_address INET)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

-- Corrigir função de limpeza de tentativas antigas
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Remover registros de tentativas de login com mais de 30 dias
  DELETE FROM public.login_attempts
  WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Corrigir função de atualização de timestamp de configurações
CREATE OR REPLACE FUNCTION public.update_security_settings_timestamp()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;
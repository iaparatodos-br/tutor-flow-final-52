-- =======================
-- AUDITORIA COMPLETA DE SEGURANÇA RLS
-- Correção de Políticas Críticas
-- =======================

-- 1. CORREÇÕES CRÍTICAS DE POLÍTICAS PERMISSIVAS

-- Remover políticas muito permissivas de pending_refunds
DROP POLICY IF EXISTS "System can manage pending refunds" ON public.pending_refunds;

-- Criar política mais restritiva para pending_refunds (apenas edge functions específicas)
CREATE POLICY "Edge functions can manage pending refunds"
ON public.pending_refunds
FOR ALL
USING (
  -- Apenas permitir para edge functions específicas via service role
  current_setting('role') = 'service_role' AND
  current_setting('request.jwt.claims', true)::json->>'iss' = 'supabase'
);

-- Melhorar política de teachers para pending_refunds
CREATE POLICY "Teachers can view their financial pending refunds"
ON public.pending_refunds
FOR SELECT
USING (
  teacher_id = auth.uid() AND 
  is_professor(auth.uid()) AND 
  teacher_has_financial_module(auth.uid())
);

-- 2. FORTALECER POLÍTICAS DA TABELA PROFILES (DADOS PII CRÍTICOS)

-- Remover política muito ampla e criar políticas mais granulares
DROP POLICY IF EXISTS "Professores podem inserir perfis como alunos" ON public.profiles;

-- Política mais restritiva para criação de perfis de alunos
CREATE POLICY "Teachers can create student profiles with validation"
ON public.profiles
FOR INSERT
WITH CHECK (
  -- Validar que é professor e que está criando um aluno
  auth.uid() IN (
    SELECT id FROM public.profiles 
    WHERE id = auth.uid() AND role = 'professor'
  ) AND
  role = 'aluno' AND
  -- Não permitir criação de perfis admin ou outros professores
  role != 'professor' AND role != 'admin'
);

-- 3. RESTRINGIR ACESSO A DADOS SENSÍVEIS DE STRIPE

-- Política mais restritiva para archived_stripe_events
DROP POLICY IF EXISTS "System can manage archived stripe events" ON public.archived_stripe_events;

CREATE POLICY "Only service role can access archived stripe events"
ON public.archived_stripe_events
FOR ALL
USING (false); -- Completamente bloqueado para users normais

-- Política mais restritiva para processed_stripe_events  
DROP POLICY IF EXISTS "System can manage processed stripe events" ON public.processed_stripe_events;

CREATE POLICY "Only service role can access processed stripe events"
ON public.processed_stripe_events
FOR ALL
USING (false); -- Completamente bloqueado para users normais

-- 4. MELHORAR ISOLAMENTO DE BUSINESS PROFILES

-- Adicionar validação extra para business_profiles
CREATE POLICY "Business profiles strict isolation"
ON public.business_profiles
FOR ALL
USING (
  auth.uid() = user_id AND
  -- Validar que o usuário é realmente professor
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() AND p.role = 'professor'
  )
)
WITH CHECK (
  auth.uid() = user_id AND
  -- Validar que o usuário é realmente professor
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() AND p.role = 'professor'
  )
);

-- 5. FORTALECER POLÍTICAS DE AUDITORIA

-- Remover políticas muito permissivas de audit_logs
DROP POLICY IF EXISTS "Teachers can view logs for their data" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can view their own audit actions" ON public.audit_logs;

-- Criar políticas mais específicas para audit_logs
CREATE POLICY "Teachers can view audit logs for their own data only"
ON public.audit_logs
FOR SELECT
USING (
  is_professor(auth.uid()) AND 
  (target_teacher_id = auth.uid() OR actor_id = auth.uid()) AND
  -- Não permitir ver logs de outros professores
  target_teacher_id = auth.uid()
);

CREATE POLICY "Users can view their own audit actions with restrictions"
ON public.audit_logs
FOR SELECT
USING (
  actor_id = auth.uid() AND
  -- Limitar apenas a logs dos últimos 90 dias para não sobrecarregar
  created_at > NOW() - INTERVAL '90 days'
);

-- 6. CRIAR FUNÇÃO DE VALIDAÇÃO DE SEGURANÇA

CREATE OR REPLACE FUNCTION public.validate_security_context()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role text;
  current_user_id uuid;
BEGIN
  -- Obter dados do usuário atual
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Obter role do usuário
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE id = current_user_id;
  
  -- Validar se o contexto de segurança está correto
  RETURN current_user_role IS NOT NULL;
END;
$$;

-- 7. ADICIONAR LOGGING DE SEGURANÇA

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  ip_address inet,
  user_agent text,
  security_level text NOT NULL DEFAULT 'info', -- info, warning, critical
  details jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- RLS para security_audit_logs
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view security audit logs"
ON public.security_audit_logs
FOR SELECT
USING (
  auth.uid() IN (
    SELECT id FROM public.profiles 
    WHERE role = 'admin'
  )
);

CREATE POLICY "System can insert security audit logs"
ON public.security_audit_logs
FOR INSERT
WITH CHECK (true); -- Permitir inserção pelo sistema

-- 8. FUNÇÃO PARA LOG DE SEGURANÇA

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_action text,
  p_resource_type text,
  p_resource_id uuid DEFAULT NULL,
  p_security_level text DEFAULT 'info',
  p_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
END;
$$;

-- 9. TRIGGER PARA MONITORAR ACESSO A DADOS SENSÍVEIS

CREATE OR REPLACE FUNCTION public.audit_sensitive_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log para operações em dados sensíveis
  IF TG_TABLE_NAME IN ('profiles', 'invoices', 'stripe_connect_accounts', 'payment_accounts') THEN
    PERFORM public.log_security_event(
      TG_OP || '_' || TG_TABLE_NAME,
      'sensitive_data_access',
      COALESCE(NEW.id, OLD.id),
      'warning',
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'user_id', auth.uid()
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplicar triggers nas tabelas sensíveis
DROP TRIGGER IF EXISTS audit_profiles_access ON public.profiles;
CREATE TRIGGER audit_profiles_access
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_data_access();

DROP TRIGGER IF EXISTS audit_invoices_access ON public.invoices;
CREATE TRIGGER audit_invoices_access
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_data_access();

DROP TRIGGER IF EXISTS audit_stripe_accounts_access ON public.stripe_connect_accounts;
CREATE TRIGGER audit_stripe_accounts_access
  AFTER INSERT OR UPDATE OR DELETE ON public.stripe_connect_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_data_access();

DROP TRIGGER IF EXISTS audit_payment_accounts_access ON public.payment_accounts;
CREATE TRIGGER audit_payment_accounts_access
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_data_access();

-- 10. FUNÇÃO DE VALIDAÇÃO DE RLS

CREATE OR REPLACE FUNCTION public.validate_rls_policies()
RETURNS table(
  table_name text,
  policy_count integer,
  has_select_policy boolean,
  has_insert_policy boolean,
  has_update_policy boolean,
  has_delete_policy boolean,
  security_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH policy_summary AS (
    SELECT 
      t.tablename,
      COUNT(p.policyname) as policy_count,
      SUM(CASE WHEN p.cmd = 'SELECT' THEN 1 ELSE 0 END) > 0 as has_select,
      SUM(CASE WHEN p.cmd = 'INSERT' THEN 1 ELSE 0 END) > 0 as has_insert,
      SUM(CASE WHEN p.cmd = 'UPDATE' THEN 1 ELSE 0 END) > 0 as has_update,
      SUM(CASE WHEN p.cmd = 'DELETE' THEN 1 ELSE 0 END) > 0 as has_delete
    FROM pg_tables t
    LEFT JOIN pg_policies p ON t.tablename = p.tablename AND p.schemaname = 'public'
    WHERE t.schemaname = 'public' AND t.rowsecurity = true
    GROUP BY t.tablename
  )
  SELECT 
    ps.tablename,
    ps.policy_count,
    ps.has_select,
    ps.has_insert,
    ps.has_update,
    ps.has_delete,
    CASE 
      WHEN ps.policy_count = 0 THEN 'CRITICAL: No policies'
      WHEN NOT (ps.has_select OR ps.has_insert OR ps.has_update OR ps.has_delete) THEN 'WARNING: No CRUD policies'
      WHEN ps.policy_count < 2 THEN 'WARNING: Limited policies'
      ELSE 'OK'
    END as security_status
  FROM policy_summary ps
  ORDER BY 
    CASE 
      WHEN ps.policy_count = 0 THEN 1
      WHEN NOT (ps.has_select OR ps.has_insert OR ps.has_update OR ps.has_delete) THEN 2
      WHEN ps.policy_count < 2 THEN 3
      ELSE 4
    END,
    ps.tablename;
END;
$$;
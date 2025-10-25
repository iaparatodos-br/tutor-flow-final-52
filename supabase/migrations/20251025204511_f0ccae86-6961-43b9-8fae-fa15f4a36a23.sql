-- FASE 1: Criar tabela imutável de aceites de termos
CREATE TABLE IF NOT EXISTS public.term_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  privacy_policy_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_term_acceptances_user_id ON public.term_acceptances(user_id);
CREATE INDEX idx_term_acceptances_accepted_at ON public.term_acceptances(accepted_at DESC);

-- Habilitar RLS
ALTER TABLE public.term_acceptances ENABLE ROW LEVEL SECURITY;

-- RLS: Usuários podem ver apenas seus próprios registros
CREATE POLICY "Users can view their own term acceptances"
  ON public.term_acceptances
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: Ninguém pode fazer UPDATE (tabela imutável)
CREATE POLICY "No one can update term acceptances"
  ON public.term_acceptances
  FOR UPDATE
  USING (false);

-- RLS: Ninguém pode fazer DELETE (tabela imutável)
CREATE POLICY "No one can delete term acceptances"
  ON public.term_acceptances
  FOR DELETE
  USING (false);

-- RLS: Sistema pode inserir via trigger
CREATE POLICY "System can insert term acceptances"
  ON public.term_acceptances
  FOR INSERT
  WITH CHECK (true);

-- Função que impede UPDATE e DELETE para garantir imutabilidade legal
CREATE OR REPLACE FUNCTION public.prevent_term_acceptance_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Term acceptances are immutable and cannot be modified or deleted for legal compliance';
END;
$$;

-- Trigger BEFORE UPDATE
CREATE TRIGGER prevent_term_acceptance_update
  BEFORE UPDATE ON public.term_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_term_acceptance_modification();

-- Trigger BEFORE DELETE
CREATE TRIGGER prevent_term_acceptance_delete
  BEFORE DELETE ON public.term_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_term_acceptance_modification();

-- Atualizar função handle_new_user() para registrar aceite de termos
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_role text;
  v_terms_version text;
  v_privacy_version text;
  v_ip_address inet;
  v_user_agent text;
BEGIN
  -- Extrair o role dos metadados
  v_role := coalesce(new.raw_user_meta_data->>'role', 'professor');
  
  -- Extrair informações de aceite dos termos dos metadados
  v_terms_version := new.raw_user_meta_data->>'terms_version';
  v_privacy_version := new.raw_user_meta_data->>'privacy_policy_version';
  v_ip_address := (new.raw_user_meta_data->>'ip_address')::inet;
  v_user_agent := new.raw_user_meta_data->>'user_agent';
  
  -- Inserir perfil
  INSERT INTO public.profiles (id, name, email, role, password_changed, address_complete)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_role,
    CASE 
      WHEN v_role = 'aluno' THEN false 
      ELSE true 
    END,
    false
  );
  
  -- Registrar aceite de termos (se fornecido)
  IF v_terms_version IS NOT NULL AND v_privacy_version IS NOT NULL THEN
    INSERT INTO public.term_acceptances (
      user_id,
      terms_version,
      privacy_policy_version,
      ip_address,
      user_agent,
      accepted_at
    ) VALUES (
      new.id,
      v_terms_version,
      v_privacy_version,
      v_ip_address,
      v_user_agent,
      NOW()
    );
  END IF;
  
  -- Se for professor, criar política de cancelamento padrão
  IF v_role = 'professor' THEN
    INSERT INTO public.cancellation_policies (
      teacher_id,
      hours_before_class,
      charge_percentage,
      allow_amnesty,
      is_active
    ) VALUES (
      new.id,
      24,
      50.00,
      true,
      true
    );
  END IF;
  
  RETURN new;
END;
$$;
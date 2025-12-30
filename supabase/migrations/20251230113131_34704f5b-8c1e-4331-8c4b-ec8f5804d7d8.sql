-- =====================================================
-- FASE 1: MIGRAÇÃO SQL - SISTEMA DE MENSALIDADES
-- Baseado em: docs/monthly-subscriptions-implementation-plan.md v1.38
-- =====================================================

-- -----------------------------------------------------
-- PASSO 1: Alterações Pré-Requisito em invoice_classes
-- Permitir NULL para suportar item_type='monthly_base'
-- -----------------------------------------------------
ALTER TABLE public.invoice_classes ALTER COLUMN class_id DROP NOT NULL;
ALTER TABLE public.invoice_classes ALTER COLUMN participant_id DROP NOT NULL;

-- -----------------------------------------------------
-- PASSO 2: Criar Tabela monthly_subscriptions
-- Planos de mensalidade criados pelo professor
-- -----------------------------------------------------
CREATE TABLE public.monthly_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  max_classes INTEGER, -- NULL = ilimitado
  overage_price NUMERIC(10,2), -- NULL = não cobra excedente
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX idx_monthly_subscriptions_teacher ON public.monthly_subscriptions(teacher_id);
CREATE INDEX idx_monthly_subscriptions_active ON public.monthly_subscriptions(teacher_id, is_active) WHERE is_active = true;

-- Habilitar RLS
ALTER TABLE public.monthly_subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Professores podem gerenciar suas mensalidades"
ON public.monthly_subscriptions
FOR ALL
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Alunos podem ver mensalidades de seus professores"
ON public.monthly_subscriptions
FOR SELECT
USING (
  teacher_id IN (
    SELECT tsr.teacher_id 
    FROM teacher_student_relationships tsr 
    WHERE tsr.student_id = auth.uid()
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_monthly_subscriptions_updated_at
  BEFORE UPDATE ON public.monthly_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------
-- PASSO 3: Criar Tabela student_monthly_subscriptions
-- Atribuição de alunos a planos de mensalidade
-- -----------------------------------------------------
CREATE TABLE public.student_monthly_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.monthly_subscriptions(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.teacher_student_relationships(id) ON DELETE CASCADE,
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at DATE, -- NULL = indeterminado
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice único parcial: máximo 1 mensalidade ativa por relacionamento
CREATE UNIQUE INDEX idx_unique_active_subscription_per_relationship 
ON public.student_monthly_subscriptions(relationship_id) 
WHERE is_active = true;

-- Índices de performance
CREATE INDEX idx_sms_subscription ON public.student_monthly_subscriptions(subscription_id);
CREATE INDEX idx_sms_relationship ON public.student_monthly_subscriptions(relationship_id);
CREATE INDEX idx_sms_active ON public.student_monthly_subscriptions(subscription_id, is_active) WHERE is_active = true;

-- Habilitar RLS
ALTER TABLE public.student_monthly_subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Professores podem gerenciar atribuições de mensalidades"
ON public.student_monthly_subscriptions
FOR ALL
USING (
  subscription_id IN (
    SELECT ms.id FROM monthly_subscriptions ms WHERE ms.teacher_id = auth.uid()
  )
)
WITH CHECK (
  subscription_id IN (
    SELECT ms.id FROM monthly_subscriptions ms WHERE ms.teacher_id = auth.uid()
  )
);

CREATE POLICY "Alunos podem ver suas próprias atribuições"
ON public.student_monthly_subscriptions
FOR SELECT
USING (
  relationship_id IN (
    SELECT tsr.id FROM teacher_student_relationships tsr WHERE tsr.student_id = auth.uid()
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_student_monthly_subscriptions_updated_at
  BEFORE UPDATE ON public.student_monthly_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------
-- PASSO 4: Triggers de Soft Delete
-- -----------------------------------------------------

-- Função para impedir DELETE físico em monthly_subscriptions
CREATE OR REPLACE FUNCTION public.prevent_monthly_subscription_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Mensalidades não podem ser deletadas. Use is_active = false para desativar.';
  RETURN NULL;
END;
$$;

-- Trigger para impedir DELETE
CREATE TRIGGER prevent_monthly_subscription_delete_trigger
  BEFORE DELETE ON public.monthly_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_monthly_subscription_delete();

-- Função para desativar alunos em cascata quando mensalidade é desativada
CREATE OR REPLACE FUNCTION public.cascade_deactivate_subscription_students()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.student_monthly_subscriptions
    SET is_active = false, updated_at = now()
    WHERE subscription_id = NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger para cascata de desativação
CREATE TRIGGER cascade_deactivate_students_trigger
  AFTER UPDATE ON public.monthly_subscriptions
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.cascade_deactivate_subscription_students();

-- -----------------------------------------------------
-- PASSO 5: Alteração na Tabela invoices
-- Adicionar referência à mensalidade
-- -----------------------------------------------------
ALTER TABLE public.invoices 
ADD COLUMN monthly_subscription_id UUID REFERENCES public.monthly_subscriptions(id);

-- Índice para performance
CREATE INDEX idx_invoices_monthly_subscription ON public.invoices(monthly_subscription_id) 
WHERE monthly_subscription_id IS NOT NULL;

-- -----------------------------------------------------
-- PASSO 6: Funções SQL
-- -----------------------------------------------------

-- 6.1: Buscar mensalidade ativa do aluno
CREATE OR REPLACE FUNCTION public.get_student_active_subscription(p_relationship_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  subscription_name TEXT,
  price NUMERIC,
  max_classes INTEGER,
  overage_price NUMERIC,
  starts_at DATE,
  student_subscription_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ms.id as subscription_id,
    ms.name as subscription_name,
    ms.price,
    ms.max_classes,
    ms.overage_price,
    sms.starts_at,
    sms.id as student_subscription_id
  FROM student_monthly_subscriptions sms
  JOIN monthly_subscriptions ms ON sms.subscription_id = ms.id
  WHERE sms.relationship_id = p_relationship_id
    AND sms.is_active = true
    AND ms.is_active = true
  LIMIT 1;
$$;

-- 6.2: Contar aulas concluídas no mês
CREATE OR REPLACE FUNCTION public.count_completed_classes_in_month(
  p_teacher_id UUID,
  p_student_id UUID,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT cp.id)::INTEGER
  FROM class_participants cp
  JOIN classes c ON cp.class_id = c.id
  WHERE c.teacher_id = p_teacher_id
    AND cp.student_id = p_student_id
    AND cp.status = 'concluida'
    AND c.is_experimental = false
    AND EXTRACT(YEAR FROM c.class_date) = p_year
    AND EXTRACT(MONTH FROM c.class_date) = p_month;
$$;

-- 6.3: Detalhes da mensalidade para Dashboard do Aluno
CREATE OR REPLACE FUNCTION public.get_student_subscription_details(p_student_id UUID)
RETURNS TABLE (
  teacher_id UUID,
  teacher_name TEXT,
  subscription_name TEXT,
  price NUMERIC,
  max_classes INTEGER,
  overage_price NUMERIC,
  starts_at DATE,
  classes_used INTEGER,
  relationship_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    tsr.teacher_id,
    p.name as teacher_name,
    ms.name as subscription_name,
    ms.price,
    ms.max_classes,
    ms.overage_price,
    sms.starts_at,
    (
      SELECT public.count_completed_classes_in_month(
        tsr.teacher_id, 
        p_student_id, 
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 
        EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
      )
    ) as classes_used,
    tsr.id as relationship_id
  FROM student_monthly_subscriptions sms
  JOIN monthly_subscriptions ms ON sms.subscription_id = ms.id
  JOIN teacher_student_relationships tsr ON sms.relationship_id = tsr.id
  JOIN profiles p ON tsr.teacher_id = p.id
  WHERE tsr.student_id = p_student_id
    AND sms.is_active = true
    AND ms.is_active = true;
$$;

-- 6.4: Contar alunos em uma mensalidade
CREATE OR REPLACE FUNCTION public.get_subscription_students_count(p_subscription_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM student_monthly_subscriptions
  WHERE subscription_id = p_subscription_id
    AND is_active = true;
$$;

-- 6.5: Listar mensalidades com contagem de alunos
CREATE OR REPLACE FUNCTION public.get_subscriptions_with_students(p_teacher_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  price NUMERIC,
  max_classes INTEGER,
  overage_price NUMERIC,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  students_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ms.id,
    ms.name,
    ms.description,
    ms.price,
    ms.max_classes,
    ms.overage_price,
    ms.is_active,
    ms.created_at,
    (SELECT public.get_subscription_students_count(ms.id)) as students_count
  FROM monthly_subscriptions ms
  WHERE ms.teacher_id = p_teacher_id
  ORDER BY ms.is_active DESC, ms.created_at DESC;
$$;

-- 6.6: Listar alunos atribuídos a uma mensalidade
CREATE OR REPLACE FUNCTION public.get_subscription_assigned_students(p_subscription_id UUID)
RETURNS TABLE (
  student_subscription_id UUID,
  relationship_id UUID,
  student_id UUID,
  student_name TEXT,
  student_email TEXT,
  starts_at DATE,
  ends_at DATE,
  is_active BOOLEAN,
  classes_used INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    sms.id as student_subscription_id,
    sms.relationship_id,
    tsr.student_id,
    COALESCE(tsr.student_name, p.name) as student_name,
    p.email as student_email,
    sms.starts_at,
    sms.ends_at,
    sms.is_active,
    (
      SELECT public.count_completed_classes_in_month(
        tsr.teacher_id, 
        tsr.student_id, 
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 
        EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
      )
    ) as classes_used
  FROM student_monthly_subscriptions sms
  JOIN teacher_student_relationships tsr ON sms.relationship_id = tsr.id
  JOIN profiles p ON tsr.student_id = p.id
  WHERE sms.subscription_id = p_subscription_id
  ORDER BY sms.is_active DESC, student_name;
$$;

-- 6.7: Verificar se aluno já tem mensalidade ativa
CREATE OR REPLACE FUNCTION public.check_student_has_active_subscription(
  p_relationship_id UUID,
  p_exclude_subscription_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM student_monthly_subscriptions sms
    JOIN monthly_subscriptions ms ON sms.subscription_id = ms.id
    WHERE sms.relationship_id = p_relationship_id
      AND sms.is_active = true
      AND ms.is_active = true
      AND (p_exclude_subscription_id IS NULL OR sms.subscription_id != p_exclude_subscription_id)
  );
$$;

-- -----------------------------------------------------
-- PASSO 7: Índices Adicionais de Performance
-- -----------------------------------------------------

-- Índice para billing em class_participants
CREATE INDEX IF NOT EXISTS idx_class_participants_billing 
ON public.class_participants(student_id, status) 
WHERE status = 'concluida';

-- Índice para billing mensal em classes
CREATE INDEX IF NOT EXISTS idx_classes_billing_month 
ON public.classes(teacher_id, class_date, is_experimental) 
WHERE is_experimental = false;
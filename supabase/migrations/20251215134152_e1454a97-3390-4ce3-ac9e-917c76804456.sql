-- =============================================
-- GRUPO 1B: Políticas RLS para dependent_id em tabelas relacionadas
-- =============================================

-- 1. Função helper: Verifica se usuário é responsável pelo dependente
CREATE OR REPLACE FUNCTION public.is_responsible_for_dependent(p_dependent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM dependents
    WHERE id = p_dependent_id
      AND responsible_id = auth.uid()
  );
$$;

-- 2. Função helper: Verifica se professor tem acesso ao dependente
CREATE OR REPLACE FUNCTION public.teacher_owns_dependent(p_dependent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM dependents
    WHERE id = p_dependent_id
      AND teacher_id = auth.uid()
  );
$$;

-- 3. Política: Responsáveis podem ver participações de seus dependentes em aulas
CREATE POLICY "responsaveis_veem_participacoes_dependentes"
  ON public.class_participants
  FOR SELECT
  USING (
    dependent_id IS NOT NULL 
    AND is_responsible_for_dependent(dependent_id)
  );

-- 4. Política: Responsáveis podem ver acesso a materiais de seus dependentes
CREATE POLICY "responsaveis_veem_material_access_dependentes"
  ON public.material_access
  FOR SELECT
  USING (
    dependent_id IS NOT NULL 
    AND is_responsible_for_dependent(dependent_id)
  );

-- 5. Política: Responsáveis podem ver feedbacks de relatórios de seus dependentes
CREATE POLICY "responsaveis_veem_feedbacks_dependentes"
  ON public.class_report_feedbacks
  FOR SELECT
  USING (
    dependent_id IS NOT NULL 
    AND is_responsible_for_dependent(dependent_id)
  );

-- 6. Índices para performance nas novas colunas dependent_id
CREATE INDEX IF NOT EXISTS idx_class_participants_dependent_id 
  ON public.class_participants(dependent_id) 
  WHERE dependent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_material_access_dependent_id 
  ON public.material_access(dependent_id) 
  WHERE dependent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_report_feedbacks_dependent_id 
  ON public.class_report_feedbacks(dependent_id) 
  WHERE dependent_id IS NOT NULL;
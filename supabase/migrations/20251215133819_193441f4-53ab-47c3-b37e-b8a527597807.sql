-- =============================================
-- GRUPO 1A (continuação): Políticas RLS básicas para dependents
-- =============================================

-- Política: Professores podem gerenciar dependentes de seus alunos
CREATE POLICY "Professores podem gerenciar dependentes de seus alunos"
  ON public.dependents
  FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Política: Responsáveis podem visualizar seus próprios dependentes
CREATE POLICY "Responsaveis podem visualizar seus dependentes"
  ON public.dependents
  FOR SELECT
  USING (responsible_id = auth.uid());
-- ========================================
-- OPÇÃO 1: Modificar política do professor
-- Excluir materializações de aulas virtuais da política do professor
-- ========================================

-- 1. Drop da política atual do professor
DROP POLICY IF EXISTS "Professores podem criar suas aulas" 
  ON public.classes;

-- 2. Recriar política do professor excluindo materializações virtuais
CREATE POLICY "Professores podem criar suas aulas"
ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = teacher_id 
  AND (
    -- Permite criação de aulas normais (não template)
    class_template_id IS NULL 
    OR 
    -- Permite criação de templates
    is_template = true
  )
);

-- 3. Comentário para documentação
COMMENT ON POLICY "Professores podem criar suas aulas" 
  ON public.classes IS 
  'Permite professores criarem suas próprias aulas e templates, mas não materializações de aulas virtuais (deixadas para política dos alunos)';
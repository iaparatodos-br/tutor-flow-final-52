-- ========================================
-- SOLUÇÃO DEFINITIVA: Função auxiliar para materialização
-- O PostgreSQL adiciona automaticamente o prefixo "classes." nas políticas
-- Solução: usar função SECURITY DEFINER que aceita parâmetros explícitos
-- ========================================

-- 1. Criar função auxiliar que verifica se aluno pode materializar
CREATE OR REPLACE FUNCTION public.can_student_materialize_class(
  p_class_template_id uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM class_participants cp 
    WHERE cp.class_id = p_class_template_id
      AND cp.student_id = p_student_id
  );
$$;

-- 2. Drop da política problemática
DROP POLICY IF EXISTS "students_can_materialize_their_virtual_classes" 
  ON public.classes;

-- 3. Recriar usando a função auxiliar
CREATE POLICY "students_can_materialize_their_virtual_classes"
ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (
  is_template = false 
  AND class_template_id IS NOT NULL
  AND public.can_student_materialize_class(class_template_id, auth.uid())
);

-- 4. Comentário para documentação
COMMENT ON POLICY "students_can_materialize_their_virtual_classes" 
  ON public.classes IS 'Permite alunos materializarem aulas virtuais usando função auxiliar SECURITY DEFINER';

COMMENT ON FUNCTION public.can_student_materialize_class(uuid, uuid) IS 
  'Verifica se um aluno é participante de um template de aula, permitindo materialização';
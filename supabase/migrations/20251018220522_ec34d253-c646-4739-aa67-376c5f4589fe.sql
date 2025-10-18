-- Remover a política problemática que causa recursão
DROP POLICY IF EXISTS "students_can_see_their_class_templates" ON classes;

-- Criar função security definer para verificar se aluno participa de uma aula
-- Isso quebra o ciclo de recursão das políticas RLS
CREATE OR REPLACE FUNCTION public.is_student_in_class(p_class_id uuid, p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM class_participants
    WHERE class_id = p_class_id
      AND student_id = p_student_id
  );
$$;

-- Recriar política usando a função security definer
CREATE POLICY "students_can_see_their_class_templates"
ON classes
FOR SELECT
USING (
  CASE
    -- Se é template, verificar se aluno tem acesso
    WHEN (is_template = true) THEN (
      -- Professor sempre pode ver seus templates
      (teacher_id = auth.uid())
      OR
      -- Aluno pode ver se é aula individual dele
      (student_id = auth.uid())
      OR
      -- Aluno pode ver se participa da aula em grupo (usando função security definer)
      (
        is_group_class = true 
        AND public.is_student_in_class(id, auth.uid())
      )
    )
    -- Se não é template, permitir (controlado por outras políticas)
    ELSE true
  END
);
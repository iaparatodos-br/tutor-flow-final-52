-- Remover política restritiva que impede alunos de verem templates
DROP POLICY IF EXISTS "students_cannot_see_templates" ON classes;

-- Criar nova política que permite alunos verem templates de suas próprias aulas
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
      -- Aluno pode ver se participa da aula em grupo
      (
        is_group_class = true 
        AND EXISTS (
          SELECT 1 
          FROM class_participants cp
          WHERE cp.class_id = classes.id 
            AND cp.student_id = auth.uid()
        )
      )
    )
    -- Se não é template, permitir (controlado por outras políticas)
    ELSE true
  END
);
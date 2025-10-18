-- Permitir alunos verem perfis de colegas em aulas em grupo
-- Criar política que permite visualizar perfis de outros alunos somente se compartilham aula em grupo

CREATE POLICY "Students can view profiles of classmates in group classes"
ON profiles
FOR SELECT
USING (
  -- Alunos podem ver perfis de outros alunos que compartilham aulas em grupo
  id IN (
    SELECT DISTINCT cp2.student_id
    FROM class_participants cp1
    INNER JOIN class_participants cp2 ON cp1.class_id = cp2.class_id
    INNER JOIN classes c ON cp1.class_id = c.id
    WHERE cp1.student_id = auth.uid()
      AND cp2.student_id != auth.uid()
      AND c.is_group_class = true
  )
);
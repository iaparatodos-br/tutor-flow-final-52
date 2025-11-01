-- Permitir alunos materializarem suas aulas virtuais para cancelamento
CREATE POLICY "students_can_materialize_their_virtual_classes"
ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (
  -- Permitir apenas materialização de instâncias virtuais
  is_template = false 
  AND class_template_id IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM class_participants cp
    WHERE cp.class_id = class_template_id
      AND cp.student_id = auth.uid()
  )
);
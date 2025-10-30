-- Permitir que alunos vejam aulas nas quais são participantes
CREATE POLICY "alunos_veem_suas_aulas" ON public.classes
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT class_id 
    FROM class_participants 
    WHERE student_id = auth.uid()
  )
);
-- Permitir que alunos vejam business profiles dos seus professores (para exibir no recibo)
CREATE POLICY "Students can view their teachers business profiles"
ON public.business_profiles
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT teacher_id 
    FROM teacher_student_relationships 
    WHERE student_id = auth.uid()
  )
);

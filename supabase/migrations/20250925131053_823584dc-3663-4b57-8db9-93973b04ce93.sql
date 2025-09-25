-- Adicionar política para permitir que professores vejam perfis de seus alunos
CREATE POLICY "Teachers can view their students profiles" 
ON public.profiles 
FOR SELECT 
USING (
  id IN (
    SELECT tsr.student_id 
    FROM teacher_student_relationships tsr 
    WHERE tsr.teacher_id = auth.uid()
  )
);
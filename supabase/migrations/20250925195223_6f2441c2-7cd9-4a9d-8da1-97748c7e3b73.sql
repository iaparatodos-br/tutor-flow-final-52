-- Permitir que alunos vejam o perfil dos seus professores
CREATE POLICY "Students can view their teachers profiles" 
ON public.profiles 
FOR SELECT 
USING (
  id IN ( 
    SELECT tsr.teacher_id
    FROM teacher_student_relationships tsr
    WHERE tsr.student_id = auth.uid()
  )
);
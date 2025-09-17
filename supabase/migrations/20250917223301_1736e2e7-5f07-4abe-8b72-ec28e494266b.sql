-- Add RLS policy for students to view their teachers' profiles
CREATE POLICY "Alunos podem ver perfis dos seus professores"
  ON public.profiles 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1
      FROM teacher_student_relationships tsr
      WHERE tsr.teacher_id = profiles.id 
      AND tsr.student_id = auth.uid()
    )
  );
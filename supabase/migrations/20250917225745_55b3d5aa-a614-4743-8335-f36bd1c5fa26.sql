-- Add RLS policy for students to view their teachers' cancellation policies
CREATE POLICY "Students can view their teachers' cancellation policies"
  ON public.cancellation_policies 
  FOR SELECT 
  USING (
    teacher_id IN (
      SELECT tsr.teacher_id
      FROM teacher_student_relationships tsr
      WHERE tsr.student_id = auth.uid()
    )
  );
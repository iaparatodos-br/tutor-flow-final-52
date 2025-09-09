-- Allow students to view their teacher's subscription
CREATE POLICY "Students can view their teacher's subscription" 
ON public.user_subscriptions 
FOR SELECT 
USING (
  user_id IN (
    SELECT p.teacher_id 
    FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.role = 'aluno' 
    AND p.teacher_id IS NOT NULL
  )
);
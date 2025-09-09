-- Drop the duplicate policy that might be causing conflicts
DROP POLICY IF EXISTS "Students can view their teacher's subscription" ON public.user_subscriptions;

-- Update the existing policy to be more specific
DROP POLICY IF EXISTS "Students can view their teacher's subscription" ON public.user_subscriptions;

-- Create the correct policy for students to access their teacher's subscription
CREATE POLICY "Students can access teacher subscription" 
ON public.user_subscriptions 
FOR SELECT 
USING (
  -- Allow professors to see their own subscriptions
  (user_id = auth.uid()) OR
  -- Allow students to see their teacher's subscription
  (user_id IN (
    SELECT p.teacher_id 
    FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.role = 'aluno' 
    AND p.teacher_id IS NOT NULL
  ))
);
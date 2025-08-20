-- Add RLS policy to allow students to see service prices for their classes
-- This allows students to view class_services when they're participants in classes using those services
CREATE POLICY "Students can view services for their classes" 
ON public.class_services 
FOR SELECT 
USING (
  id IN (
    SELECT c.service_id 
    FROM classes c 
    LEFT JOIN class_participants cp ON c.id = cp.class_id
    WHERE c.student_id = auth.uid() OR cp.student_id = auth.uid()
  )
);
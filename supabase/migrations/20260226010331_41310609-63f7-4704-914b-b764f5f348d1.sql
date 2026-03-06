
-- Add RLS policy for students to view class_services via class_participants
-- This replaces the old policy that referenced the deprecated classes.student_id column

DROP POLICY IF EXISTS "Students can view services for their classes" ON public.class_services;

CREATE POLICY "Students can view services for their classes"
ON public.class_services
FOR SELECT
USING (
  id IN (
    SELECT c.service_id
    FROM classes c
    JOIN class_participants cp ON c.id = cp.class_id
    WHERE cp.student_id = auth.uid()
      AND c.service_id IS NOT NULL
  )
);

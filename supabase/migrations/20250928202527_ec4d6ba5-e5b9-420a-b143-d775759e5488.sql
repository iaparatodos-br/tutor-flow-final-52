-- Add billed flag to classes table to track invoiced classes
ALTER TABLE public.classes 
ADD COLUMN billed boolean DEFAULT false;

-- Create index for optimized billing queries
CREATE INDEX idx_classes_billing ON public.classes(teacher_id, student_id, status, billed) 
WHERE status = 'concluida' AND billed = false;

-- Update existing completed classes to maintain current behavior
-- (they should remain unbilled until next billing cycle)
UPDATE public.classes 
SET billed = false 
WHERE status = 'concluida';
-- Create enum for exception status
CREATE TYPE exception_status AS ENUM ('canceled', 'rescheduled');

-- Table to store class exceptions
CREATE TABLE public.class_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    exception_date TIMESTAMPTZ NOT NULL, -- The original date/time of the occurrence being overridden
    status exception_status NOT NULL,

    -- Fields to store new values in case of 'rescheduled'
    new_start_time TIMESTAMPTZ,
    new_end_time TIMESTAMPTZ,
    new_title TEXT,
    new_description TEXT,
    new_duration_minutes INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Ensures no two exceptions for the same occurrence of the same class
    CONSTRAINT unique_exception_per_occurrence UNIQUE (original_class_id, exception_date)
);

-- Enable RLS
ALTER TABLE public.class_exceptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Teachers can manage their own class exceptions"
ON public.class_exceptions
FOR ALL
USING (
  original_class_id IN (
    SELECT id FROM classes WHERE teacher_id = auth.uid()
  )
)
WITH CHECK (
  original_class_id IN (
    SELECT id FROM classes WHERE teacher_id = auth.uid()
  )
);

-- Trigger for auto-updating updated_at field
CREATE TRIGGER update_class_exceptions_updated_at
BEFORE UPDATE ON public.class_exceptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create table for availability blocks (vacation, appointments, etc.)
CREATE TABLE public.availability_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_pattern JSONB, -- For storing recurring patterns if needed
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for working hours configuration
CREATE TABLE public.working_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, etc.
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, day_of_week)
);

-- Enable Row Level Security
ALTER TABLE public.availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;

-- Create policies for availability_blocks
CREATE POLICY "Professores podem gerenciar seus bloqueios"
ON public.availability_blocks
FOR ALL
USING (auth.uid() = teacher_id);

-- Create policies for working_hours
CREATE POLICY "Professores podem gerenciar seus horários"
ON public.working_hours
FOR ALL
USING (auth.uid() = teacher_id);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_availability_blocks_updated_at
BEFORE UPDATE ON public.availability_blocks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_working_hours_updated_at
BEFORE UPDATE ON public.working_hours
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX idx_availability_blocks_teacher_id ON public.availability_blocks(teacher_id);
CREATE INDEX idx_availability_blocks_datetime ON public.availability_blocks(start_datetime, end_datetime);
CREATE INDEX idx_working_hours_teacher_id ON public.working_hours(teacher_id);
CREATE INDEX idx_working_hours_day ON public.working_hours(day_of_week);
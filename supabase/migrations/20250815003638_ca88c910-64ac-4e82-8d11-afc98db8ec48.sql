-- Create table for class participants (multiple students per class)
CREATE TABLE public.class_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(class_id, student_id)
);

-- Enable RLS for class_participants
ALTER TABLE public.class_participants ENABLE ROW LEVEL SECURITY;

-- Create policies for class_participants
CREATE POLICY "Professores podem gerenciar participantes de suas aulas" 
ON public.class_participants 
FOR ALL 
USING (
  class_id IN (
    SELECT id FROM public.classes WHERE teacher_id = auth.uid()
  )
);

CREATE POLICY "Alunos podem ver suas participações" 
ON public.class_participants 
FOR SELECT 
USING (student_id = auth.uid());

-- Add new columns to classes table
ALTER TABLE public.classes 
ADD COLUMN is_experimental BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN is_group_class BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN recurrence_pattern JSONB,
ADD COLUMN parent_class_id UUID REFERENCES public.classes(id);

-- Create table for class notifications
CREATE TABLE public.class_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('confirmation', 'reminder', 'cancellation', 'rescheduling')),
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for class_notifications
ALTER TABLE public.class_notifications ENABLE ROW LEVEL SECURITY;

-- Create policies for class_notifications
CREATE POLICY "Professores podem ver notificações de suas aulas" 
ON public.class_notifications 
FOR SELECT 
USING (
  class_id IN (
    SELECT id FROM public.classes WHERE teacher_id = auth.uid()
  )
);

CREATE POLICY "Alunos podem ver suas notificações" 
ON public.class_notifications 
FOR SELECT 
USING (student_id = auth.uid());

CREATE POLICY "Sistema pode inserir notificações" 
ON public.class_notifications 
FOR INSERT 
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_class_participants_class_id ON public.class_participants(class_id);
CREATE INDEX idx_class_participants_student_id ON public.class_participants(student_id);
CREATE INDEX idx_classes_parent_class_id ON public.classes(parent_class_id);
CREATE INDEX idx_classes_is_experimental ON public.classes(is_experimental);
CREATE INDEX idx_classes_is_group_class ON public.classes(is_group_class);
CREATE INDEX idx_class_notifications_class_id ON public.class_notifications(class_id);
CREATE INDEX idx_class_notifications_student_id ON public.class_notifications(student_id);

-- Create trigger for updated_at on class_participants
CREATE TRIGGER update_class_participants_updated_at
BEFORE UPDATE ON public.class_participants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing classes to have at least one participant record
INSERT INTO public.class_participants (class_id, student_id)
SELECT id, student_id 
FROM public.classes 
WHERE student_id IS NOT NULL
ON CONFLICT (class_id, student_id) DO NOTHING;
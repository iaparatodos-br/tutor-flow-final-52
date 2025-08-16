-- Criar tabela para relatos de aulas
CREATE TABLE public.class_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL,
  teacher_id UUID NOT NULL,
  lesson_summary TEXT NOT NULL,
  homework TEXT,
  extra_materials TEXT,
  individual_feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.class_reports ENABLE ROW LEVEL SECURITY;

-- Professores podem gerenciar relatos de suas próprias aulas
CREATE POLICY "Professores podem gerenciar seus relatos de aula" 
ON public.class_reports 
FOR ALL 
USING (auth.uid() = teacher_id);

-- Alunos podem visualizar relatos das aulas que participaram (aulas individuais)
CREATE POLICY "Alunos podem ver relatos de suas aulas individuais" 
ON public.class_reports 
FOR SELECT 
USING (
  class_id IN (
    SELECT id 
    FROM classes 
    WHERE student_id = auth.uid()
  )
);

-- Alunos podem visualizar relatos das aulas em grupo que participaram
CREATE POLICY "Alunos podem ver relatos de suas aulas em grupo" 
ON public.class_reports 
FOR SELECT 
USING (
  class_id IN (
    SELECT class_id 
    FROM class_participants 
    WHERE student_id = auth.uid()
  )
);

-- Responsáveis podem ver relatos de aulas de seus alunos
CREATE POLICY "Responsáveis podem ver relatos de aulas de seus alunos" 
ON public.class_reports 
FOR SELECT 
USING (
  class_id IN (
    SELECT c.id 
    FROM classes c 
    JOIN profiles p ON p.id = c.student_id 
    WHERE p.teacher_id = auth.uid()
  )
  OR
  class_id IN (
    SELECT cp.class_id 
    FROM class_participants cp 
    JOIN profiles p ON p.id = cp.student_id 
    WHERE p.teacher_id = auth.uid()
  )
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_class_reports_updated_at
BEFORE UPDATE ON public.class_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar novo tipo de notificação
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'class_report_created';
-- Create class_reports table
CREATE TABLE IF NOT EXISTS public.class_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL,
  teacher_id UUID NOT NULL,
  lesson_summary TEXT NOT NULL,
  homework TEXT,
  extra_materials TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.class_reports ENABLE ROW LEVEL SECURITY;

-- RLS: Teachers manage their own reports
CREATE POLICY "Teachers can select their reports"
ON public.class_reports FOR SELECT
USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert their reports"
ON public.class_reports FOR INSERT
WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update their reports"
ON public.class_reports FOR UPDATE
USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete their reports"
ON public.class_reports FOR DELETE
USING (auth.uid() = teacher_id);

-- RLS: Students can view reports of their classes (individual)
CREATE POLICY "Students can view reports of their individual classes"
ON public.class_reports FOR SELECT
USING (
  class_id IN (
    SELECT id FROM public.classes WHERE student_id = auth.uid()
  )
);

-- RLS: Students can view reports of group classes they participate in
CREATE POLICY "Students can view reports of their group classes"
ON public.class_reports FOR SELECT
USING (
  class_id IN (
    SELECT class_id FROM public.class_participants WHERE student_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_class_reports_updated_at
BEFORE UPDATE ON public.class_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create class_report_feedbacks table for per-student feedback
CREATE TABLE IF NOT EXISTS public.class_report_feedbacks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL,
  student_id UUID NOT NULL,
  feedback TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.class_report_feedbacks ENABLE ROW LEVEL SECURITY;

-- RLS: Teachers manage feedbacks for their reports
CREATE POLICY "Teachers can select feedbacks for their reports"
ON public.class_report_feedbacks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.class_reports r
    WHERE r.id = report_id AND r.teacher_id = auth.uid()
  )
);

CREATE POLICY "Teachers can insert feedbacks for their reports"
ON public.class_report_feedbacks FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.class_reports r
    WHERE r.id = report_id AND r.teacher_id = auth.uid()
  )
);

CREATE POLICY "Teachers can update feedbacks for their reports"
ON public.class_report_feedbacks FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.class_reports r
    WHERE r.id = report_id AND r.teacher_id = auth.uid()
  )
);

CREATE POLICY "Teachers can delete feedbacks for their reports"
ON public.class_report_feedbacks FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.class_reports r
    WHERE r.id = report_id AND r.teacher_id = auth.uid()
  )
);

-- RLS: Students can view their own feedback only
CREATE POLICY "Students can view their own feedback"
ON public.class_report_feedbacks FOR SELECT
USING (student_id = auth.uid());

-- Trigger for updated_at on feedbacks
CREATE TRIGGER update_class_report_feedbacks_updated_at
BEFORE UPDATE ON public.class_report_feedbacks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
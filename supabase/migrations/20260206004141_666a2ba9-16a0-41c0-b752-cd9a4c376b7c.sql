-- Create storage bucket for class report photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('class-report-photos', 'class-report-photos', true);

-- Create table for class report photos
CREATE TABLE public.class_report_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.class_reports(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.class_report_photos ENABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX idx_class_report_photos_report_id ON public.class_report_photos(report_id);

-- RLS: Professores podem ver fotos dos seus relatórios
CREATE POLICY "Professores podem ver fotos dos seus relatórios"
ON public.class_report_photos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.class_reports cr 
    WHERE cr.id = report_id AND cr.teacher_id = auth.uid()
  )
);

-- RLS: Alunos podem ver fotos de relatórios das suas aulas
CREATE POLICY "Alunos podem ver fotos de relatórios"
ON public.class_report_photos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.class_reports cr
    JOIN public.class_participants cp ON cp.class_id = cr.class_id
    WHERE cr.id = report_id AND cp.student_id = auth.uid()
  )
);

-- RLS: Professores podem adicionar fotos aos seus relatórios
CREATE POLICY "Professores podem adicionar fotos"
ON public.class_report_photos FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.class_reports cr 
    WHERE cr.id = report_id AND cr.teacher_id = auth.uid()
  )
);

-- RLS: Professores podem remover fotos dos seus relatórios
CREATE POLICY "Professores podem remover fotos"
ON public.class_report_photos FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.class_reports cr 
    WHERE cr.id = report_id AND cr.teacher_id = auth.uid()
  )
);

-- Storage Policies: Professores podem fazer upload de fotos
CREATE POLICY "Professores podem upload de fotos de relatório"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'class-report-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage Policies: Professores podem deletar fotos
CREATE POLICY "Professores podem deletar fotos de relatório"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'class-report-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage Policies: Fotos são públicas para leitura
CREATE POLICY "Fotos de relatório são públicas para leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'class-report-photos');
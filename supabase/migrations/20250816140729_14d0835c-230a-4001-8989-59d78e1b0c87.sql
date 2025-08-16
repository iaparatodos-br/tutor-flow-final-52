-- Criar bucket para materiais de ensino
INSERT INTO storage.buckets (id, name, public) VALUES ('teaching-materials', 'teaching-materials', true);

-- Criar tabela de categorias de materiais
CREATE TABLE public.material_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de materiais
CREATE TABLE public.materials (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL,
    category_id UUID REFERENCES public.material_categories(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de acesso aos materiais
CREATE TABLE public.material_access (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    granted_by UUID NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_access ENABLE ROW LEVEL SECURITY;

-- RLS Policies para categorias
CREATE POLICY "Professores podem gerenciar suas categorias de materiais" 
ON public.material_categories 
FOR ALL 
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- RLS Policies para materiais
CREATE POLICY "Professores podem gerenciar seus materiais" 
ON public.materials 
FOR ALL 
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Alunos podem ver materiais compartilhados com eles" 
ON public.materials 
FOR SELECT 
USING (id IN (
    SELECT material_id 
    FROM public.material_access 
    WHERE student_id = auth.uid()
));

-- RLS Policies para acesso aos materiais
CREATE POLICY "Professores podem gerenciar acessos aos seus materiais" 
ON public.material_access 
FOR ALL 
USING (material_id IN (
    SELECT id 
    FROM public.materials 
    WHERE teacher_id = auth.uid()
))
WITH CHECK (material_id IN (
    SELECT id 
    FROM public.materials 
    WHERE teacher_id = auth.uid()
));

CREATE POLICY "Alunos podem ver seus acessos" 
ON public.material_access 
FOR SELECT 
USING (auth.uid() = student_id);

-- Storage policies para teaching-materials
CREATE POLICY "Professores podem fazer upload de materiais" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
    bucket_id = 'teaching-materials' AND 
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Professores podem atualizar seus materiais" 
ON storage.objects 
FOR UPDATE 
USING (
    bucket_id = 'teaching-materials' AND 
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Professores podem deletar seus materiais" 
ON storage.objects 
FOR DELETE 
USING (
    bucket_id = 'teaching-materials' AND 
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Materiais são visíveis para download" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'teaching-materials');

-- Trigger para atualizar updated_at
CREATE TRIGGER update_material_categories_updated_at
BEFORE UPDATE ON public.material_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_materials_updated_at
BEFORE UPDATE ON public.materials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_materials_teacher_id ON public.materials(teacher_id);
CREATE INDEX idx_materials_category_id ON public.materials(category_id);
CREATE INDEX idx_material_access_material_id ON public.material_access(material_id);
CREATE INDEX idx_material_access_student_id ON public.material_access(student_id);
CREATE INDEX idx_material_categories_teacher_id ON public.material_categories(teacher_id);
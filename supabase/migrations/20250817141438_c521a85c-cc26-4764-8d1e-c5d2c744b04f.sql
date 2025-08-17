-- Criar tabela para serviços de aulas (tipos de aula com preços)
CREATE TABLE public.class_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.class_services ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS
CREATE POLICY "Professores podem gerenciar seus serviços" 
ON public.class_services 
FOR ALL 
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- Adicionar campo service_id na tabela classes
ALTER TABLE public.classes 
ADD COLUMN service_id UUID REFERENCES public.class_services(id);

-- Criar trigger para updated_at
CREATE TRIGGER update_class_services_updated_at
BEFORE UPDATE ON public.class_services
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Criar índices para performance
CREATE INDEX idx_class_services_teacher_id ON public.class_services(teacher_id);
CREATE INDEX idx_class_services_active ON public.class_services(teacher_id, is_active) WHERE is_active = true;
CREATE INDEX idx_classes_service_id ON public.classes(service_id);

-- Criar função para garantir apenas um serviço padrão por professor
CREATE OR REPLACE FUNCTION public.ensure_single_default_service()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    -- Remove o padrão dos outros serviços do mesmo professor
    UPDATE public.class_services 
    SET is_default = false 
    WHERE teacher_id = NEW.teacher_id 
      AND id != NEW.id 
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para garantir apenas um serviço padrão
CREATE TRIGGER trigger_ensure_single_default_service
  BEFORE INSERT OR UPDATE ON public.class_services
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_default_service();
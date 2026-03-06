-- =============================================
-- GRUPO 1A: Tabela Principal e Colunas
-- Sistema de Dependentes - TutorFlow
-- =============================================

-- 1.1 Criar tabela dependents
CREATE TABLE public.dependents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  responsible_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Comentário na tabela
COMMENT ON TABLE public.dependents IS 'Alunos menores de idade vinculados a um responsável (pai/mãe)';
COMMENT ON COLUMN public.dependents.responsible_id IS 'ID do responsável (pai/mãe) que tem login no sistema';
COMMENT ON COLUMN public.dependents.teacher_id IS 'ID do professor que atende este dependente';

-- Trigger para atualizar updated_at
CREATE TRIGGER update_dependents_updated_at
  BEFORE UPDATE ON public.dependents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS na tabela dependents
ALTER TABLE public.dependents ENABLE ROW LEVEL SECURITY;

-- 1.2 Adicionar coluna dependent_id em class_participants
ALTER TABLE public.class_participants
  ADD COLUMN dependent_id UUID REFERENCES public.dependents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.class_participants.dependent_id IS 'Se preenchido, indica que o participante é um dependente (menor)';

-- 1.3 Adicionar coluna dependent_id em material_access
ALTER TABLE public.material_access
  ADD COLUMN dependent_id UUID REFERENCES public.dependents(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.material_access.dependent_id IS 'Se preenchido, material compartilhado com dependente específico';

-- 1.4 Adicionar coluna dependent_id em class_report_feedbacks
ALTER TABLE public.class_report_feedbacks
  ADD COLUMN dependent_id UUID REFERENCES public.dependents(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.class_report_feedbacks.dependent_id IS 'Se preenchido, feedback vinculado a dependente específico';
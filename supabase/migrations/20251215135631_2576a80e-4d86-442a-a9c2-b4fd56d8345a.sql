-- =============================================
-- GRUPO 1D (restante): Índices de Performance
-- =============================================

-- Índices de performance na tabela dependents
CREATE INDEX IF NOT EXISTS idx_dependents_responsible_id 
  ON public.dependents(responsible_id);

CREATE INDEX IF NOT EXISTS idx_dependents_teacher_id 
  ON public.dependents(teacher_id);

CREATE INDEX IF NOT EXISTS idx_dependents_teacher_responsible 
  ON public.dependents(teacher_id, responsible_id);
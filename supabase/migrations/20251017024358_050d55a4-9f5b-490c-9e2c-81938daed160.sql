-- Migration: Sistema de Aulas Template e Materializadas
-- Adiciona suporte para templates de aulas recorrentes

-- 1. Adicionar novas colunas na tabela classes
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS class_template_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMPTZ;

-- 2. Criar índices para otimização
CREATE INDEX IF NOT EXISTS idx_classes_is_template 
ON public.classes(is_template) 
WHERE is_template = true;

CREATE INDEX IF NOT EXISTS idx_classes_template_id 
ON public.classes(class_template_id) 
WHERE class_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classes_teacher_date 
ON public.classes(teacher_id, class_date);

CREATE INDEX IF NOT EXISTS idx_classes_template_active 
ON public.classes(teacher_id, is_template, recurrence_end_date) 
WHERE is_template = true AND recurrence_pattern IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classes_materialized_by_template
ON public.classes(class_template_id, class_date) 
WHERE class_template_id IS NOT NULL;

-- 3. Adicionar comentários para documentação
COMMENT ON COLUMN public.classes.is_template IS 'Indica se esta é uma aula template (não aparece na agenda)';
COMMENT ON COLUMN public.classes.class_template_id IS 'ID da aula template que originou esta aula materializada';
COMMENT ON COLUMN public.classes.recurrence_end_date IS 'Data de término da recorrência (se definida, encerra a série)';

-- 4. Atualizar RPC get_calendar_events para separar templates de aulas materializadas
CREATE OR REPLACE FUNCTION public.get_calendar_events(
  p_teacher_id UUID, 
  p_start_date TIMESTAMPTZ, 
  p_end_date TIMESTAMPTZ
)
RETURNS SETOF public.classes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- 1. Aulas materializadas (is_template = false) dentro do período
  SELECT c.*
  FROM classes c
  WHERE 
    c.teacher_id = p_teacher_id 
    AND c.is_template = FALSE
    AND c.class_date >= p_start_date 
    AND c.class_date <= p_end_date
  
  UNION ALL
  
  -- 2. Aulas template (is_template = true) para gerar virtuais no frontend
  -- Retorna templates ativas que:
  -- - Têm recorrência infinita OU
  -- - Têm recorrência finita que ainda não terminou
  SELECT c.*
  FROM classes c
  WHERE 
    c.teacher_id = p_teacher_id 
    AND c.is_template = TRUE
    AND c.recurrence_pattern IS NOT NULL
    AND (
      -- Template ainda não encerrada
      c.recurrence_end_date IS NULL 
      OR c.recurrence_end_date >= p_start_date
    );
END;
$$;

-- 5. Política RLS adicional para templates
CREATE POLICY "students_cannot_see_templates" ON public.classes
FOR SELECT TO authenticated
USING (
  CASE 
    WHEN is_template = TRUE THEN teacher_id = auth.uid()
    ELSE TRUE
  END
);
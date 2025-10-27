-- Migration: Garantir participantes para aulas individuais concluídas
-- Parte 1: Criar função e trigger para novas aulas

CREATE OR REPLACE FUNCTION public.ensure_individual_class_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Se a aula é individual e foi concluída
  IF NEW.is_group_class = FALSE 
     AND NEW.status = 'concluida' 
     AND NEW.student_id IS NOT NULL 
  THEN
    -- Verificar se já existe participante
    IF NOT EXISTS (
      SELECT 1 FROM class_participants 
      WHERE class_id = NEW.id 
      AND student_id = NEW.student_id
    ) THEN
      -- Criar participante automaticamente
      INSERT INTO class_participants (
        class_id,
        student_id,
        status,
        completed_at,
        billed,
        charge_applied
      ) VALUES (
        NEW.id,
        NEW.student_id,
        'concluida',
        NEW.updated_at,
        NEW.billed,
        NEW.charge_applied
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger
DROP TRIGGER IF EXISTS trigger_ensure_individual_class_participant ON classes;

CREATE TRIGGER trigger_ensure_individual_class_participant
AFTER UPDATE ON classes
FOR EACH ROW
WHEN (NEW.status = 'concluida' AND NEW.is_group_class = FALSE)
EXECUTE FUNCTION ensure_individual_class_participant();

-- Parte 2: Migration retroativa - criar participantes para aulas individuais concluídas existentes
INSERT INTO class_participants (
  class_id,
  student_id,
  status,
  completed_at,
  billed,
  charge_applied,
  cancelled_at,
  cancelled_by,
  cancellation_reason
)
SELECT 
  c.id as class_id,
  c.student_id,
  c.status,
  c.updated_at as completed_at,
  c.billed,
  c.charge_applied,
  c.cancelled_at,
  c.cancelled_by,
  c.cancellation_reason
FROM classes c
WHERE c.is_group_class = FALSE
  AND c.student_id IS NOT NULL
  AND c.status IN ('concluida', 'cancelada')
  AND NOT EXISTS (
    SELECT 1 FROM class_participants cp
    WHERE cp.class_id = c.id
    AND cp.student_id = c.student_id
  )
ON CONFLICT DO NOTHING;
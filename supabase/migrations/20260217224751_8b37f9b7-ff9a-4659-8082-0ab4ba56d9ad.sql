-- Fase 4: Adicionar filtro is_paid_class à RPC get_unbilled_participants_v2
-- Apenas aulas pagas (is_paid_class = true) devem ser faturadas

DROP FUNCTION IF EXISTS get_unbilled_participants_v2(uuid, uuid, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION get_unbilled_participants_v2(
  p_teacher_id uuid, 
  p_student_id uuid DEFAULT NULL, 
  p_status text DEFAULT 'concluida',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  participant_id uuid,
  class_id uuid,
  student_id uuid,
  dependent_id uuid,
  dependent_name text,
  responsible_id uuid,
  class_date timestamptz,
  service_id uuid,
  charge_applied boolean,
  class_services jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cp.id as participant_id,
    cp.class_id,
    cp.student_id,
    cp.dependent_id,
    d.name as dependent_name,
    d.responsible_id,
    c.class_date,
    c.service_id,
    cp.charge_applied,
    jsonb_build_object(
      'id', cs.id,
      'name', cs.name,
      'price', cs.price,
      'description', cs.description
    ) as class_services
  FROM class_participants cp
  JOIN classes c ON cp.class_id = c.id
  LEFT JOIN class_services cs ON c.service_id = cs.id
  LEFT JOIN invoice_classes ic ON cp.id = ic.participant_id
  LEFT JOIN dependents d ON cp.dependent_id = d.id
  WHERE c.teacher_id = p_teacher_id
    AND cp.status = p_status
    AND c.is_experimental = false
    AND c.is_paid_class = true  -- FASE 4: Apenas aulas pagas são faturáveis
    AND ic.id IS NULL
    AND (p_start_date IS NULL OR c.class_date >= p_start_date)
    AND (p_end_date IS NULL OR c.class_date < p_end_date)
    AND (
      p_student_id IS NULL 
      OR cp.student_id = p_student_id
      OR d.responsible_id = p_student_id
    );
$$;
-- FASE 1: Criar views e function helpers para status de faturamento
-- View que mostra quais participantes foram faturados
CREATE OR REPLACE VIEW participant_billing_status AS
SELECT 
  cp.id as participant_id,
  cp.class_id,
  cp.student_id,
  CASE 
    WHEN ic.id IS NOT NULL THEN true 
    ELSE false 
  END as is_billed,
  ic.invoice_id,
  ic.item_type,
  ic.created_at as billed_at
FROM class_participants cp
LEFT JOIN invoice_classes ic ON cp.id = ic.participant_id;

-- View agregada para status de classes
CREATE OR REPLACE VIEW class_billing_status AS
SELECT 
  c.id as class_id,
  c.teacher_id,
  BOOL_OR(ic.id IS NOT NULL) as has_billed_items,
  COUNT(DISTINCT cp.id) as total_participants,
  COUNT(DISTINCT ic.participant_id) as billed_participants,
  CASE 
    WHEN COUNT(DISTINCT cp.id) = COUNT(DISTINCT ic.participant_id) AND COUNT(DISTINCT cp.id) > 0 THEN true
    ELSE false
  END as fully_billed
FROM classes c
LEFT JOIN class_participants cp ON c.id = cp.class_id
LEFT JOIN invoice_classes ic ON cp.id = ic.participant_id
GROUP BY c.id, c.teacher_id;

-- Function: Get unbilled participants
CREATE OR REPLACE FUNCTION get_unbilled_participants(
  p_teacher_id uuid,
  p_student_id uuid DEFAULT NULL,
  p_status text DEFAULT 'concluida'
)
RETURNS TABLE (
  participant_id uuid,
  class_id uuid,
  student_id uuid,
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
  WHERE c.teacher_id = p_teacher_id
    AND cp.status = p_status
    AND ic.id IS NULL
    AND (p_student_id IS NULL OR cp.student_id = p_student_id);
$$;
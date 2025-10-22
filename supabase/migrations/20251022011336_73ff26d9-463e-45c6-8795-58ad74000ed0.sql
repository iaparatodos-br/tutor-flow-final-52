-- Criar função RPC para buscar aulas com participantes em uma única query
CREATE OR REPLACE FUNCTION get_classes_with_participants(
  p_teacher_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  teacher_id UUID,
  student_id UUID,
  class_date TIMESTAMPTZ,
  duration_minutes INTEGER,
  status TEXT,
  notes TEXT,
  is_experimental BOOLEAN,
  is_group_class BOOLEAN,
  recurrence_pattern JSONB,
  parent_class_id UUID,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  charge_applied BOOLEAN,
  amnesty_granted BOOLEAN,
  amnesty_granted_by UUID,
  amnesty_granted_at TIMESTAMPTZ,
  service_id UUID,
  billed BOOLEAN,
  is_template BOOLEAN,
  class_template_id UUID,
  recurrence_end_date TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  participants JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.teacher_id,
    c.student_id,
    c.class_date,
    c.duration_minutes,
    c.status,
    c.notes,
    c.is_experimental,
    c.is_group_class,
    c.recurrence_pattern,
    c.parent_class_id,
    c.cancelled_at,
    c.cancelled_by,
    c.charge_applied,
    c.amnesty_granted,
    c.amnesty_granted_by,
    c.amnesty_granted_at,
    c.service_id,
    c.billed,
    c.is_template,
    c.class_template_id,
    c.recurrence_end_date,
    c.cancellation_reason,
    c.created_at,
    c.updated_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cp.id,
          'class_id', cp.class_id,
          'student_id', cp.student_id,
          'status', cp.status,
          'created_at', cp.created_at,
          'updated_at', cp.updated_at,
          'cancelled_at', cp.cancelled_at,
          'cancelled_by', cp.cancelled_by,
          'charge_applied', cp.charge_applied,
          'confirmed_at', cp.confirmed_at,
          'completed_at', cp.completed_at,
          'billed', cp.billed,
          'cancellation_reason', cp.cancellation_reason,
          'profiles', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'email', p.email
          )
        )
        ORDER BY p.name
      ) FILTER (WHERE cp.student_id IS NOT NULL),
      '[]'::jsonb
    ) as participants
  FROM classes c
  LEFT JOIN class_participants cp ON c.id = cp.class_id
  LEFT JOIN profiles p ON cp.student_id = p.id
  WHERE c.teacher_id = p_teacher_id
    AND c.class_date >= p_start_date
    AND c.class_date <= p_end_date
    AND c.is_template IS NOT TRUE
  GROUP BY c.id
  ORDER BY c.class_date;
END;
$$;
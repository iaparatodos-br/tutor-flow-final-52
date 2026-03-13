DROP FUNCTION IF EXISTS public.get_classes_with_participants(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_classes_with_participants(
  p_teacher_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  teacher_id UUID,
  student_id UUID,
  class_date TIMESTAMPTZ,
  duration_minutes INT,
  status TEXT,
  notes TEXT,
  is_experimental BOOLEAN,
  is_group_class BOOLEAN,
  service_id UUID,
  is_template BOOLEAN,
  class_template_id UUID,
  recurrence_pattern JSONB,
  recurrence_end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  charge_applied BOOLEAN,
  cancellation_reason TEXT,
  amnesty_granted BOOLEAN,
  amnesty_granted_by UUID,
  amnesty_granted_at TIMESTAMPTZ,
  participants JSONB,
  profiles JSONB,
  is_paid_class BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.teacher_id,
    NULL::uuid as student_id,
    c.class_date,
    c.duration_minutes,
    c.status,
    c.notes,
    c.is_experimental,
    c.is_group_class,
    c.service_id,
    c.is_template,
    c.class_template_id,
    c.recurrence_pattern,
    c.recurrence_end_date,
    c.created_at,
    c.updated_at,
    c.cancelled_at,
    c.cancelled_by,
    c.charge_applied,
    c.cancellation_reason,
    c.amnesty_granted,
    c.amnesty_granted_by,
    c.amnesty_granted_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cp.id,
          'student_id', cp.student_id,
          'dependent_id', cp.dependent_id,
          'dependent_name', d.name,
          'status', cp.status,
          'confirmed_at', cp.confirmed_at,
          'completed_at', cp.completed_at,
          'cancelled_at', cp.cancelled_at,
          'cancelled_by', cp.cancelled_by,
          'charge_applied', cp.charge_applied,
          'cancellation_reason', cp.cancellation_reason,
          'amnesty_granted', cp.amnesty_granted,
          'amnesty_granted_by', cp.amnesty_granted_by,
          'amnesty_granted_at', cp.amnesty_granted_at,
          'profiles', jsonb_build_object(
            'name', p.name,
            'email', p.email
          )
        ) ORDER BY COALESCE(d.name, p.name)
      ) FILTER (WHERE cp.student_id IS NOT NULL),
      '[]'::jsonb
    ) as participants,
    NULL::jsonb as profiles,
    c.is_paid_class
  FROM classes c
  LEFT JOIN class_participants cp ON c.id = cp.class_id
  LEFT JOIN profiles p ON cp.student_id = p.id
  LEFT JOIN dependents d ON cp.dependent_id = d.id
  WHERE c.teacher_id = p_teacher_id
    AND c.is_template = FALSE
    AND c.class_date >= p_start_date
    AND c.class_date <= p_end_date
  GROUP BY c.id

  UNION ALL

  SELECT 
    c.id,
    c.teacher_id,
    NULL::uuid as student_id,
    c.class_date,
    c.duration_minutes,
    c.status,
    c.notes,
    c.is_experimental,
    c.is_group_class,
    c.service_id,
    c.is_template,
    c.class_template_id,
    c.recurrence_pattern,
    c.recurrence_end_date,
    c.created_at,
    c.updated_at,
    c.cancelled_at,
    c.cancelled_by,
    c.charge_applied,
    c.cancellation_reason,
    c.amnesty_granted,
    c.amnesty_granted_by,
    c.amnesty_granted_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cp.id,
          'student_id', cp.student_id,
          'dependent_id', cp.dependent_id,
          'dependent_name', d.name,
          'status', cp.status,
          'confirmed_at', cp.confirmed_at,
          'completed_at', cp.completed_at,
          'cancelled_at', cp.cancelled_at,
          'cancelled_by', cp.cancelled_by,
          'charge_applied', cp.charge_applied,
          'cancellation_reason', cp.cancellation_reason,
          'amnesty_granted', cp.amnesty_granted,
          'amnesty_granted_by', cp.amnesty_granted_by,
          'amnesty_granted_at', cp.amnesty_granted_at,
          'profiles', jsonb_build_object(
            'name', p.name,
            'email', p.email
          )
        ) ORDER BY COALESCE(d.name, p.name)
      ) FILTER (WHERE cp.student_id IS NOT NULL),
      '[]'::jsonb
    ) as participants,
    NULL::jsonb as profiles,
    c.is_paid_class
  FROM classes c
  LEFT JOIN class_participants cp ON c.id = cp.class_id
  LEFT JOIN profiles p ON cp.student_id = p.id
  LEFT JOIN dependents d ON cp.dependent_id = d.id
  WHERE c.teacher_id = p_teacher_id
    AND c.is_template = TRUE
  GROUP BY c.id
  
  ORDER BY class_date;
END;
$$;
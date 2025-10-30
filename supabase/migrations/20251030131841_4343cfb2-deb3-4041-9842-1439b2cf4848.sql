-- Dropar função existente e recriar sem campo billed
DROP FUNCTION IF EXISTS public.get_classes_with_participants(uuid, timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.get_classes_with_participants(
  p_teacher_id uuid, 
  p_start_date timestamp with time zone, 
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  id uuid,
  teacher_id uuid,
  student_id uuid,
  class_date timestamp with time zone,
  duration_minutes integer,
  status text,
  notes text,
  is_experimental boolean,
  is_group_class boolean,
  service_id uuid,
  is_template boolean,
  class_template_id uuid,
  recurrence_pattern jsonb,
  recurrence_end_date timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  charge_applied boolean,
  cancellation_reason text,
  amnesty_granted boolean,
  amnesty_granted_by uuid,
  amnesty_granted_at timestamp with time zone,
  participants jsonb,
  profiles jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
          'status', cp.status,
          'confirmed_at', cp.confirmed_at,
          'completed_at', cp.completed_at,
          'cancelled_at', cp.cancelled_at,
          'cancelled_by', cp.cancelled_by,
          'charge_applied', cp.charge_applied,
          'cancellation_reason', cp.cancellation_reason,
          'profiles', jsonb_build_object(
            'name', p.name,
            'email', p.email
          )
        ) ORDER BY p.name
      ) FILTER (WHERE cp.student_id IS NOT NULL),
      '[]'::jsonb
    ) as participants,
    NULL::jsonb as profiles
  FROM classes c
  LEFT JOIN class_participants cp ON c.id = cp.class_id
  LEFT JOIN profiles p ON cp.student_id = p.id
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
          'status', cp.status,
          'confirmed_at', cp.confirmed_at,
          'completed_at', cp.completed_at,
          'cancelled_at', cp.cancelled_at,
          'cancelled_by', cp.cancelled_by,
          'charge_applied', cp.charge_applied,
          'cancellation_reason', cp.cancellation_reason,
          'profiles', jsonb_build_object(
            'name', p.name,
            'email', p.email
          )
        ) ORDER BY p.name
      ) FILTER (WHERE cp.student_id IS NOT NULL),
      '[]'::jsonb
    ) as participants,
    NULL::jsonb as profiles
  FROM classes c
  LEFT JOIN class_participants cp ON c.id = cp.class_id
  LEFT JOIN profiles p ON cp.student_id = p.id
  WHERE c.teacher_id = p_teacher_id
    AND c.is_template = TRUE
  GROUP BY c.id
  
  ORDER BY class_date;
END;
$function$;

COMMENT ON FUNCTION public.get_classes_with_participants IS 
'Retorna aulas com participantes agregados em JSON. Campo billed removido - usar invoice_classes para verificar faturamento.';
-- Drop the existing function
DROP FUNCTION IF EXISTS public.get_classes_with_participants(uuid, timestamp with time zone, timestamp with time zone);

-- Recreate with fix for individual classes showing participants
CREATE OR REPLACE FUNCTION public.get_classes_with_participants(
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
  recurrence_pattern jsonb,
  parent_class_id uuid,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  charge_applied boolean,
  amnesty_granted boolean,
  amnesty_granted_by uuid,
  amnesty_granted_at timestamp with time zone,
  service_id uuid,
  billed boolean,
  is_template boolean,
  class_template_id uuid,
  recurrence_end_date timestamp with time zone,
  cancellation_reason text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  participants jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  -- 1. Aulas materializadas dentro do período
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
    -- Fix: Include individual student in participants array
    CASE 
      WHEN c.is_group_class = TRUE THEN
        -- For group classes, use class_participants
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
        )
      ELSE
        -- For individual classes, use student_id from class
        CASE 
          WHEN c.student_id IS NOT NULL THEN
            jsonb_build_array(
              jsonb_build_object(
                'id', NULL,
                'class_id', c.id,
                'student_id', c.student_id,
                'status', c.status,
                'created_at', c.created_at,
                'updated_at', c.updated_at,
                'cancelled_at', c.cancelled_at,
                'cancelled_by', c.cancelled_by,
                'charge_applied', c.charge_applied,
                'confirmed_at', NULL,
                'completed_at', NULL,
                'billed', c.billed,
                'cancellation_reason', c.cancellation_reason,
                'profiles', jsonb_build_object(
                  'id', p_individual.id,
                  'name', p_individual.name,
                  'email', p_individual.email
                )
              )
            )
          ELSE '[]'::jsonb
        END
    END as participants
  FROM classes c
  LEFT JOIN class_participants cp ON c.id = cp.class_id
  LEFT JOIN profiles p ON cp.student_id = p.id
  LEFT JOIN profiles p_individual ON c.student_id = p_individual.id
  WHERE c.teacher_id = p_teacher_id
    AND c.is_template = FALSE
    AND c.class_date >= p_start_date
    AND c.class_date <= p_end_date
  GROUP BY c.id, p_individual.id, p_individual.name, p_individual.email

  UNION ALL

  -- 2. Templates ativos para gerar instâncias virtuais no frontend
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
    -- Same fix for templates
    CASE 
      WHEN c.is_group_class = TRUE THEN
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
        )
      ELSE
        CASE 
          WHEN c.student_id IS NOT NULL THEN
            jsonb_build_array(
              jsonb_build_object(
                'id', NULL,
                'class_id', c.id,
                'student_id', c.student_id,
                'status', c.status,
                'created_at', c.created_at,
                'updated_at', c.updated_at,
                'cancelled_at', c.cancelled_at,
                'cancelled_by', c.cancelled_by,
                'charge_applied', c.charge_applied,
                'confirmed_at', NULL,
                'completed_at', NULL,
                'billed', c.billed,
                'cancellation_reason', c.cancellation_reason,
                'profiles', jsonb_build_object(
                  'id', p_individual.id,
                  'name', p_individual.name,
                  'email', p_individual.email
                )
              )
            )
          ELSE '[]'::jsonb
        END
    END as participants
  FROM classes c
  LEFT JOIN class_participants cp ON c.id = cp.class_id
  LEFT JOIN profiles p ON cp.student_id = p.id
  LEFT JOIN profiles p_individual ON c.student_id = p_individual.id
  WHERE c.teacher_id = p_teacher_id
    AND c.is_template = TRUE
    AND c.recurrence_pattern IS NOT NULL
    AND (
      c.recurrence_end_date IS NULL 
      OR c.recurrence_end_date >= p_start_date
    )
  GROUP BY c.id, p_individual.id, p_individual.name, p_individual.email
  
  ORDER BY class_date;
END;
$function$;
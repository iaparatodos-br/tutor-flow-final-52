
-- =============================================================================
-- Fase 4: Timezone-aware RPCs (retry - fixed column references)
-- =============================================================================

-- 1) count_completed_classes_in_month
CREATE OR REPLACE FUNCTION public.count_completed_classes_in_month(
  p_teacher_id uuid,
  p_student_id uuid,
  p_year integer,
  p_month integer,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT cp.id)::INTEGER
  FROM class_participants cp
  JOIN classes c ON cp.class_id = c.id
  WHERE c.teacher_id = p_teacher_id
    AND cp.student_id = p_student_id
    AND cp.status = 'concluida'
    AND c.is_experimental = false
    AND EXTRACT(YEAR FROM c.class_date AT TIME ZONE p_timezone) = p_year
    AND EXTRACT(MONTH FROM c.class_date AT TIME ZONE p_timezone) = p_month;
$function$;


-- 2) get_billing_cycle_dates
CREATE OR REPLACE FUNCTION public.get_billing_cycle_dates(
  p_billing_day integer,
  p_reference_date date DEFAULT NULL,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE(cycle_start date, cycle_end date)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref_date DATE;
  v_current_day INTEGER;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_adjusted_billing_day INTEGER;
  v_last_day_of_month INTEGER;
BEGIN
  v_ref_date := COALESCE(p_reference_date, (NOW() AT TIME ZONE p_timezone)::DATE);
  v_current_day := EXTRACT(DAY FROM v_ref_date)::INTEGER;
  v_current_month := EXTRACT(MONTH FROM v_ref_date)::INTEGER;
  v_current_year := EXTRACT(YEAR FROM v_ref_date)::INTEGER;
  
  IF v_current_day >= p_billing_day THEN
    v_last_day_of_month := EXTRACT(DAY FROM (DATE_TRUNC('month', v_ref_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    v_adjusted_billing_day := LEAST(p_billing_day, v_last_day_of_month);
    v_cycle_start := make_date(v_current_year, v_current_month, v_adjusted_billing_day);
    
    v_last_day_of_month := EXTRACT(DAY FROM (DATE_TRUNC('month', v_ref_date + INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    v_adjusted_billing_day := LEAST(p_billing_day, v_last_day_of_month);
    v_cycle_end := make_date(
      EXTRACT(YEAR FROM v_ref_date + INTERVAL '1 month')::INTEGER,
      EXTRACT(MONTH FROM v_ref_date + INTERVAL '1 month')::INTEGER,
      v_adjusted_billing_day
    ) - INTERVAL '1 day';
  ELSE
    v_last_day_of_month := EXTRACT(DAY FROM (DATE_TRUNC('month', v_ref_date - INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    v_adjusted_billing_day := LEAST(p_billing_day, v_last_day_of_month);
    v_cycle_start := make_date(
      EXTRACT(YEAR FROM v_ref_date - INTERVAL '1 month')::INTEGER,
      EXTRACT(MONTH FROM v_ref_date - INTERVAL '1 month')::INTEGER,
      v_adjusted_billing_day
    );
    
    v_last_day_of_month := EXTRACT(DAY FROM (DATE_TRUNC('month', v_ref_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    v_adjusted_billing_day := LEAST(p_billing_day, v_last_day_of_month);
    v_cycle_end := make_date(v_current_year, v_current_month, v_adjusted_billing_day) - INTERVAL '1 day';
  END IF;
  
  RETURN QUERY SELECT v_cycle_start, v_cycle_end;
END;
$function$;


-- 3) count_completed_classes_in_billing_cycle
CREATE OR REPLACE FUNCTION public.count_completed_classes_in_billing_cycle(
  p_teacher_id uuid,
  p_student_id uuid,
  p_billing_day integer,
  p_reference_date date DEFAULT NULL,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref_date DATE;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_count INTEGER;
BEGIN
  v_ref_date := COALESCE(p_reference_date, (NOW() AT TIME ZONE p_timezone)::DATE);

  SELECT cycle_start, cycle_end INTO v_cycle_start, v_cycle_end
  FROM get_billing_cycle_dates(p_billing_day, v_ref_date, p_timezone);
  
  SELECT COUNT(DISTINCT cp.id)::INTEGER INTO v_count
  FROM class_participants cp
  JOIN classes c ON cp.class_id = c.id
  WHERE c.teacher_id = p_teacher_id
    AND cp.student_id = p_student_id
    AND cp.status = 'concluida'
    AND c.is_experimental = false
    AND (c.class_date AT TIME ZONE p_timezone)::DATE >= v_cycle_start
    AND (c.class_date AT TIME ZONE p_timezone)::DATE <= v_cycle_end;
  
  RETURN COALESCE(v_count, 0);
END;
$function$;


-- 4) get_student_active_subscription
CREATE OR REPLACE FUNCTION public.get_student_active_subscription(
  p_relationship_id uuid,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE(subscription_id uuid, subscription_name text, price numeric, starts_at text, student_subscription_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ms.id AS subscription_id,
    ms.name AS subscription_name,
    ms.price,
    sms.starts_at::TEXT,
    sms.id AS student_subscription_id
  FROM student_monthly_subscriptions sms
  JOIN monthly_subscriptions ms ON sms.subscription_id = ms.id
  WHERE sms.relationship_id = p_relationship_id
    AND sms.is_active = true
    AND ms.is_active = true
    AND (sms.ends_at IS NULL OR sms.ends_at > (NOW() AT TIME ZONE p_timezone)::DATE)
  LIMIT 1;
END;
$function$;


-- 5) get_student_subscription_details (overload 1: student only)
--    Removed max_classes/overage_price (columns don't exist on monthly_subscriptions)
CREATE OR REPLACE FUNCTION public.get_student_subscription_details(
  p_student_id uuid,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE(teacher_id uuid, teacher_name text, subscription_name text, price numeric, starts_at date, classes_used integer, relationship_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    tsr.teacher_id,
    p.name as teacher_name,
    ms.name as subscription_name,
    ms.price,
    sms.starts_at,
    (
      SELECT public.count_completed_classes_in_month(
        tsr.teacher_id, 
        p_student_id, 
        EXTRACT(YEAR FROM (NOW() AT TIME ZONE p_timezone)::DATE)::INTEGER, 
        EXTRACT(MONTH FROM (NOW() AT TIME ZONE p_timezone)::DATE)::INTEGER,
        p_timezone
      )
    ) as classes_used,
    tsr.id as relationship_id
  FROM student_monthly_subscriptions sms
  JOIN monthly_subscriptions ms ON sms.subscription_id = ms.id
  JOIN teacher_student_relationships tsr ON sms.relationship_id = tsr.id
  JOIN profiles p ON tsr.teacher_id = p.id
  WHERE tsr.student_id = p_student_id
    AND sms.is_active = true
    AND ms.is_active = true;
$function$;


-- 6) get_student_subscription_details (overload 2: student + teacher)
CREATE OR REPLACE FUNCTION public.get_student_subscription_details(
  p_student_id uuid,
  p_teacher_id uuid,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE(teacher_id uuid, teacher_name text, subscription_name text, price numeric, starts_at text, classes_used bigint, relationship_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    tsr.teacher_id,
    p.name AS teacher_name,
    ms.name AS subscription_name,
    ms.price,
    sms.starts_at::TEXT,
    public.count_completed_classes_in_month(
      tsr.teacher_id,
      tsr.student_id,
      EXTRACT(YEAR FROM (NOW() AT TIME ZONE p_timezone)::DATE)::INTEGER,
      EXTRACT(MONTH FROM (NOW() AT TIME ZONE p_timezone)::DATE)::INTEGER,
      p_timezone
    ) AS classes_used,
    tsr.id AS relationship_id
  FROM teacher_student_relationships tsr
  JOIN student_monthly_subscriptions sms ON tsr.id = sms.relationship_id
  JOIN monthly_subscriptions ms ON sms.subscription_id = ms.id
  JOIN profiles p ON tsr.teacher_id = p.id
  WHERE tsr.student_id = p_student_id
    AND tsr.teacher_id = p_teacher_id
    AND sms.is_active = true
    AND ms.is_active = true
  LIMIT 1;
END;
$function$;


-- 7) get_subscription_assigned_students
CREATE OR REPLACE FUNCTION public.get_subscription_assigned_students(
  p_subscription_id uuid,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE(student_subscription_id uuid, relationship_id uuid, student_id uuid, student_name text, student_email text, starts_at date, ends_at date, is_active boolean, classes_used integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    sms.id as student_subscription_id,
    sms.relationship_id,
    tsr.student_id,
    COALESCE(tsr.student_name, p.name) as student_name,
    p.email as student_email,
    sms.starts_at,
    sms.ends_at,
    sms.is_active,
    (
      SELECT public.count_completed_classes_in_month(
        tsr.teacher_id, 
        tsr.student_id, 
        EXTRACT(YEAR FROM (NOW() AT TIME ZONE p_timezone)::DATE)::INTEGER, 
        EXTRACT(MONTH FROM (NOW() AT TIME ZONE p_timezone)::DATE)::INTEGER,
        p_timezone
      )
    ) as classes_used
  FROM student_monthly_subscriptions sms
  JOIN teacher_student_relationships tsr ON sms.relationship_id = tsr.id
  JOIN profiles p ON tsr.student_id = p.id
  WHERE sms.subscription_id = p_subscription_id
    AND sms.is_active = true
  ORDER BY student_name;
$function$;


-- 8) get_teacher_notifications
CREATE OR REPLACE FUNCTION public.get_teacher_notifications(
  p_status text DEFAULT 'inbox',
  p_is_read boolean DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE(id uuid, teacher_id uuid, source_type text, source_id uuid, category text, status text, is_read boolean, created_at timestamp with time zone, read_at timestamp with time zone, status_changed_at timestamp with time zone, class_date timestamp with time zone, class_status text, student_name text, student_email text, invoice_amount numeric, invoice_due_date date, invoice_status text, service_name text, days_overdue integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_teacher_id UUID := auth.uid();
  v_today DATE := (NOW() AT TIME ZONE p_timezone)::DATE;
BEGIN
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    tn.id,
    tn.teacher_id,
    tn.source_type,
    tn.source_id,
    tn.category,
    tn.status,
    tn.is_read,
    tn.created_at,
    tn.read_at,
    tn.status_changed_at,
    c.class_date,
    c.status as class_status,
    COALESCE(
      CASE 
        WHEN tn.source_type = 'class' THEN (
          SELECT COALESCE(d.name, p.name, 'Aluno não identificado')
          FROM class_participants cp
          LEFT JOIN profiles p ON cp.student_id = p.id
          LEFT JOIN dependents d ON cp.dependent_id = d.id
          WHERE cp.class_id = tn.source_id
          LIMIT 1
        )
        WHEN tn.source_type = 'invoice' THEN (
          SELECT COALESCE(p.name, 'Aluno não identificado')
          FROM profiles p
          WHERE p.id = i.student_id
        )
      END,
      'Aluno não identificado'
    ) as student_name,
    CASE 
      WHEN tn.source_type = 'class' THEN (
        SELECT p.email
        FROM class_participants cp
        LEFT JOIN profiles p ON cp.student_id = p.id
        WHERE cp.class_id = tn.source_id
        LIMIT 1
      )
      WHEN tn.source_type = 'invoice' THEN (
        SELECT p.email FROM profiles p WHERE p.id = i.student_id
      )
    END as student_email,
    i.amount as invoice_amount,
    i.due_date as invoice_due_date,
    i.status as invoice_status,
    cs.name as service_name,
    CASE 
      WHEN tn.source_type = 'invoice' AND i.due_date IS NOT NULL THEN
        GREATEST(0, (v_today - i.due_date))
      WHEN tn.source_type = 'class' AND c.class_date IS NOT NULL THEN
        GREATEST(0, EXTRACT(DAY FROM (NOW() - c.class_date))::INTEGER)
      ELSE 0
    END as days_overdue
  FROM public.teacher_notifications tn
  LEFT JOIN public.classes c ON tn.source_type = 'class' AND tn.source_id = c.id
  LEFT JOIN public.invoices i ON tn.source_type = 'invoice' AND tn.source_id = i.id
  LEFT JOIN public.class_services cs ON c.service_id = cs.id
  WHERE tn.teacher_id = v_teacher_id
    AND tn.status = p_status
    AND (p_is_read IS NULL OR tn.is_read = p_is_read)
    AND (p_category IS NULL OR tn.category = p_category)
    AND (tn.source_type != 'class' OR (c.is_experimental = false AND c.is_template = false))
  ORDER BY tn.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

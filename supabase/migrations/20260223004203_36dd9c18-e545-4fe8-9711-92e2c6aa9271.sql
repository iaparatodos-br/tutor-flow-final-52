
-- Drop existing RPCs first (return type changed)
DROP FUNCTION IF EXISTS public.get_student_active_subscription(UUID);
DROP FUNCTION IF EXISTS public.get_student_subscription_details(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_subscriptions_with_students(UUID);

-- Remove max_classes and overage_price columns
ALTER TABLE public.monthly_subscriptions DROP COLUMN IF EXISTS max_classes;
ALTER TABLE public.monthly_subscriptions DROP COLUMN IF EXISTS overage_price;

-- Recreate RPC: get_student_active_subscription
CREATE OR REPLACE FUNCTION public.get_student_active_subscription(p_relationship_id UUID)
RETURNS TABLE(
  subscription_id UUID,
  subscription_name TEXT,
  price NUMERIC,
  starts_at TEXT,
  student_subscription_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    AND (sms.ends_at IS NULL OR sms.ends_at > CURRENT_DATE)
  LIMIT 1;
END;
$$;

-- Recreate RPC: get_student_subscription_details
CREATE OR REPLACE FUNCTION public.get_student_subscription_details(p_student_id UUID, p_teacher_id UUID)
RETURNS TABLE(
  teacher_id UUID,
  teacher_name TEXT,
  subscription_name TEXT,
  price NUMERIC,
  starts_at TEXT,
  classes_used BIGINT,
  relationship_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
      EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
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
$$;

-- Recreate RPC: get_subscriptions_with_students
CREATE OR REPLACE FUNCTION public.get_subscriptions_with_students(p_teacher_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  description TEXT,
  price NUMERIC,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  teacher_id UUID,
  students_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ms.id,
    ms.name,
    ms.description,
    ms.price,
    ms.is_active,
    ms.created_at,
    ms.updated_at,
    ms.teacher_id,
    COUNT(sms.id) FILTER (WHERE sms.is_active = true) AS students_count
  FROM monthly_subscriptions ms
  LEFT JOIN student_monthly_subscriptions sms ON ms.id = sms.subscription_id
  WHERE ms.teacher_id = p_teacher_id
  GROUP BY ms.id, ms.name, ms.description, ms.price, ms.is_active, ms.created_at, ms.updated_at, ms.teacher_id
  ORDER BY ms.is_active DESC, ms.created_at DESC;
END;
$$;

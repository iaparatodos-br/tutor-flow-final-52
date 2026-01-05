-- Atualizar a função get_subscription_assigned_students para filtrar apenas alunos ativos
CREATE OR REPLACE FUNCTION public.get_subscription_assigned_students(p_subscription_id uuid)
RETURNS TABLE(
  student_subscription_id uuid, 
  relationship_id uuid, 
  student_id uuid, 
  student_name text, 
  student_email text, 
  starts_at date, 
  ends_at date, 
  is_active boolean, 
  classes_used integer
)
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
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 
        EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
      )
    ) as classes_used
  FROM student_monthly_subscriptions sms
  JOIN teacher_student_relationships tsr ON sms.relationship_id = tsr.id
  JOIN profiles p ON tsr.student_id = p.id
  WHERE sms.subscription_id = p_subscription_id
    AND sms.is_active = true
  ORDER BY student_name;
$function$;
-- Update get_teacher_students function to include business_profile_id
CREATE OR REPLACE FUNCTION public.get_teacher_students(teacher_user_id uuid)
 RETURNS TABLE(student_id uuid, student_name text, student_email text, student_role text, guardian_name text, guardian_email text, guardian_phone text, relationship_id uuid, billing_day integer, stripe_customer_id text, created_at timestamp with time zone, business_profile_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    tsr.student_id,
    COALESCE(tsr.student_name, p.name) as student_name,
    p.email as student_email,
    p.role as student_role,
    COALESCE(tsr.student_guardian_name, p.guardian_name) as guardian_name,
    COALESCE(tsr.student_guardian_email, p.guardian_email) as guardian_email,
    COALESCE(tsr.student_guardian_phone, p.guardian_phone) as guardian_phone,
    tsr.id as relationship_id,
    tsr.billing_day,
    tsr.stripe_customer_id,
    tsr.created_at,
    tsr.business_profile_id
  FROM teacher_student_relationships tsr
  JOIN profiles p ON p.id = tsr.student_id
  WHERE tsr.teacher_id = teacher_user_id
  ORDER BY COALESCE(tsr.student_name, p.name) ASC;
$function$;
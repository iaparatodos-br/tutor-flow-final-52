-- Phase 1: Fix function signature and update RLS policies

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Professores podem ver seus alunos vinculados" ON public.profiles;
DROP POLICY IF EXISTS "Professores podem atualizar perfis de seus alunos vinculados" ON public.profiles;  
DROP POLICY IF EXISTS "Professores podem excluir seus alunos vinculados" ON public.profiles;
DROP POLICY IF EXISTS "Professores podem inserir alunos" ON public.profiles;

-- Create new policies that don't restrict by role
CREATE POLICY "Professores podem ver perfis vinculados" ON public.profiles
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM teacher_student_relationships tsr 
    WHERE tsr.student_id = profiles.id AND tsr.teacher_id = auth.uid()
  )
);

CREATE POLICY "Professores podem atualizar perfis vinculados" ON public.profiles
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM teacher_student_relationships tsr 
    WHERE tsr.student_id = profiles.id AND tsr.teacher_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM teacher_student_relationships tsr 
    WHERE tsr.student_id = profiles.id AND tsr.teacher_id = auth.uid()
  )
);

CREATE POLICY "Professores podem excluir perfis vinculados" ON public.profiles
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM teacher_student_relationships tsr 
    WHERE tsr.student_id = profiles.id AND tsr.teacher_id = auth.uid()
  )
);

CREATE POLICY "Professores podem inserir perfis como alunos" ON public.profiles
FOR INSERT WITH CHECK (
  auth.uid() IN (
    SELECT p.id FROM profiles p 
    WHERE p.id = auth.uid() AND p.role = 'professor'
  )
);

-- Drop and recreate the function with new signature
DROP FUNCTION public.get_teacher_students(uuid);

CREATE OR REPLACE FUNCTION public.get_teacher_students(teacher_user_id uuid)
RETURNS TABLE(
  student_id uuid, 
  student_name text, 
  student_email text, 
  student_role text,
  guardian_name text, 
  guardian_email text, 
  guardian_phone text, 
  relationship_id uuid, 
  billing_day integer, 
  stripe_customer_id text, 
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    tsr.student_id,
    p.name as student_name,
    p.email as student_email,
    p.role as student_role,
    p.guardian_name,
    p.guardian_email,
    p.guardian_phone,
    tsr.id as relationship_id,
    tsr.billing_day,
    tsr.stripe_customer_id,
    tsr.created_at
  FROM teacher_student_relationships tsr
  JOIN profiles p ON p.id = tsr.student_id
  WHERE tsr.teacher_id = teacher_user_id
  ORDER BY p.name ASC;
$function$
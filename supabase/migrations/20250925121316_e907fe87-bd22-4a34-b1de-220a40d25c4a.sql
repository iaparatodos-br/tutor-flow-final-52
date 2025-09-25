-- Fix infinite recursion in RLS policies - simpler approach

-- Create function to get user role safely from auth.users
CREATE OR REPLACE FUNCTION public.get_current_user_role_safe()
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT raw_user_meta_data ->> 'role' FROM auth.users WHERE id = auth.uid());
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Drop existing problematic policies on profiles
DROP POLICY IF EXISTS "profiles_own_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_professor_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_student_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_teacher_student_delete" ON public.profiles;
DROP POLICY IF EXISTS "profiles_teacher_student_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_teacher_student_update" ON public.profiles;

-- Create simple, non-recursive policies for profiles
CREATE POLICY "profiles_own_access" ON public.profiles
FOR ALL USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Allow professors to be inserted based on auth.users metadata
CREATE POLICY "profiles_professor_insert" ON public.profiles
FOR INSERT WITH CHECK (
  auth.uid() = id AND 
  get_current_user_role_safe() = 'professor'
);

-- Allow students to be inserted  
CREATE POLICY "profiles_student_insert" ON public.profiles
FOR INSERT WITH CHECK (
  get_current_user_role_safe() = 'aluno'
);

-- Drop problematic policies on teacher_student_relationships
DROP POLICY IF EXISTS "Students can view their teacher relationships" ON public.teacher_student_relationships;
DROP POLICY IF EXISTS "Teachers can manage their student relationships" ON public.teacher_student_relationships;

-- Create simple policies for teacher_student_relationships
CREATE POLICY "tsr_student_select" ON public.teacher_student_relationships
FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "tsr_teacher_manage" ON public.teacher_student_relationships
FOR ALL USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- Drop problematic policies on business_profiles
DROP POLICY IF EXISTS "Business profiles strict isolation" ON public.business_profiles;
DROP POLICY IF EXISTS "Users can manage their own business profiles" ON public.business_profiles;

-- Create simple policy for business_profiles
CREATE POLICY "business_profiles_own_access" ON public.business_profiles
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
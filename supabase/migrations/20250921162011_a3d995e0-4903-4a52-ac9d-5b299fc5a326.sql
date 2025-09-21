-- Add business_profile_id column to teacher_student_relationships
ALTER TABLE public.teacher_student_relationships
ADD COLUMN business_profile_id UUID REFERENCES public.business_profiles(id) ON DELETE SET NULL;

-- Add comment to explain the column purpose
COMMENT ON COLUMN public.teacher_student_relationships.business_profile_id
IS 'Define o negócio padrão (e sua respectiva conta bancária) que recebe os pagamentos deste aluno.';
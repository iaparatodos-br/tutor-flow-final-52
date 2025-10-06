-- Adicionar campos de CPF e endereço do responsável financeiro

-- Adicionar campos na tabela profiles
ALTER TABLE public.profiles
ADD COLUMN guardian_cpf text,
ADD COLUMN guardian_address_street text,
ADD COLUMN guardian_address_city text,
ADD COLUMN guardian_address_state text,
ADD COLUMN guardian_address_postal_code text;

-- Adicionar campos na tabela teacher_student_relationships
ALTER TABLE public.teacher_student_relationships
ADD COLUMN student_guardian_cpf text,
ADD COLUMN student_guardian_address_street text,
ADD COLUMN student_guardian_address_city text,
ADD COLUMN student_guardian_address_state text,
ADD COLUMN student_guardian_address_postal_code text;

COMMENT ON COLUMN public.profiles.guardian_cpf IS 'CPF do responsável financeiro';
COMMENT ON COLUMN public.profiles.guardian_address_street IS 'Endereço completo do responsável';
COMMENT ON COLUMN public.profiles.guardian_address_city IS 'Cidade do responsável';
COMMENT ON COLUMN public.profiles.guardian_address_state IS 'Estado do responsável';
COMMENT ON COLUMN public.profiles.guardian_address_postal_code IS 'CEP do responsável';

COMMENT ON COLUMN public.teacher_student_relationships.student_guardian_cpf IS 'CPF do responsável financeiro do aluno';
COMMENT ON COLUMN public.teacher_student_relationships.student_guardian_address_street IS 'Endereço do responsável do aluno';
COMMENT ON COLUMN public.teacher_student_relationships.student_guardian_address_city IS 'Cidade do responsável do aluno';
COMMENT ON COLUMN public.teacher_student_relationships.student_guardian_address_state IS 'Estado do responsável do aluno';
COMMENT ON COLUMN public.teacher_student_relationships.student_guardian_address_postal_code IS 'CEP do responsável do aluno';
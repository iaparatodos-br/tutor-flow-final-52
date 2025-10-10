-- Fase 1: Garantir que todos os dados de responsável estão em teacher_student_relationships
-- Copiar dados de profiles para teacher_student_relationships onde estiver faltando

UPDATE teacher_student_relationships tsr
SET 
  student_guardian_name = COALESCE(tsr.student_guardian_name, p.guardian_name),
  student_guardian_email = COALESCE(tsr.student_guardian_email, p.guardian_email),
  student_guardian_phone = COALESCE(tsr.student_guardian_phone, p.guardian_phone),
  student_guardian_cpf = COALESCE(tsr.student_guardian_cpf, p.guardian_cpf),
  student_guardian_address_street = COALESCE(tsr.student_guardian_address_street, p.guardian_address_street),
  student_guardian_address_city = COALESCE(tsr.student_guardian_address_city, p.guardian_address_city),
  student_guardian_address_state = COALESCE(tsr.student_guardian_address_state, p.guardian_address_state),
  student_guardian_address_postal_code = COALESCE(tsr.student_guardian_address_postal_code, p.guardian_address_postal_code)
FROM profiles p
WHERE tsr.student_id = p.id
  AND (
    tsr.student_guardian_name IS NULL OR
    tsr.student_guardian_email IS NULL OR
    tsr.student_guardian_phone IS NULL OR
    tsr.student_guardian_cpf IS NULL OR
    tsr.student_guardian_address_street IS NULL OR
    tsr.student_guardian_address_city IS NULL OR
    tsr.student_guardian_address_state IS NULL OR
    tsr.student_guardian_address_postal_code IS NULL
  );

-- Fase 2: Remover colunas de responsável da tabela profiles
ALTER TABLE profiles 
  DROP COLUMN IF EXISTS guardian_name,
  DROP COLUMN IF EXISTS guardian_email,
  DROP COLUMN IF EXISTS guardian_phone,
  DROP COLUMN IF EXISTS guardian_cpf,
  DROP COLUMN IF EXISTS guardian_address_street,
  DROP COLUMN IF EXISTS guardian_address_city,
  DROP COLUMN IF EXISTS guardian_address_state,
  DROP COLUMN IF EXISTS guardian_address_postal_code;

-- Adicionar comentário para documentar a mudança
COMMENT ON TABLE teacher_student_relationships IS 'Tabela que armazena relacionamentos entre professores e alunos. TODOS os dados de responsável/guardian devem ser armazenados AQUI, não na tabela profiles. Isso permite que um mesmo aluno tenha diferentes responsáveis para diferentes professores.';
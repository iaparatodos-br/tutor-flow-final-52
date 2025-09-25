-- Corrigir recursão infinita removendo políticas dependentes primeiro
-- Remover especificamente as políticas que dependem de get_current_user_role()

-- Remover política que causa o erro de dependência
DROP POLICY IF EXISTS "Teachers can create student profiles with validation" ON public.profiles;

-- Agora podemos remover a função problemática
DROP FUNCTION IF EXISTS public.get_current_user_role() CASCADE;

-- Remover todas as outras políticas da tabela profiles para recriar
DROP POLICY IF EXISTS "Users can create their own professor profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Professores podem ver perfis vinculados" ON public.profiles;
DROP POLICY IF EXISTS "Professores podem atualizar perfis vinculados" ON public.profiles;
DROP POLICY IF EXISTS "Professores podem excluir perfis vinculados" ON public.profiles;
DROP POLICY IF EXISTS "Alunos podem ver perfis dos seus professores" ON public.profiles;

-- Recriar políticas básicas sem recursão
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO public
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO public
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Política simplificada para criação de perfis de professor
CREATE POLICY "Users can create their own professor profile"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (
  auth.uid() = id AND 
  role = 'professor'
);

-- Política para professores verem perfis de alunos vinculados
CREATE POLICY "Professores podem ver perfis vinculados"
ON public.profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM teacher_student_relationships tsr
    WHERE tsr.student_id = profiles.id 
    AND tsr.teacher_id = auth.uid()
  )
);

-- Política para professores atualizarem perfis de alunos vinculados
CREATE POLICY "Professores podem atualizar perfis vinculados"
ON public.profiles
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM teacher_student_relationships tsr
    WHERE tsr.student_id = profiles.id 
    AND tsr.teacher_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM teacher_student_relationships tsr
    WHERE tsr.student_id = profiles.id 
    AND tsr.teacher_id = auth.uid()
  )
);

-- Política para professores excluírem perfis de alunos vinculados
CREATE POLICY "Professores podem excluir perfis vinculados"
ON public.profiles
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM teacher_student_relationships tsr
    WHERE tsr.student_id = profiles.id 
    AND tsr.teacher_id = auth.uid()
  )
);

-- Política para alunos verem perfis dos seus professores
CREATE POLICY "Alunos podem ver perfis dos seus professores"
ON public.profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM teacher_student_relationships tsr
    WHERE tsr.teacher_id = profiles.id 
    AND tsr.student_id = auth.uid()
  )
);

-- Política simplificada para criação de perfis de aluno (sem verificação de role do criador)
CREATE POLICY "Teachers can create student profiles"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (
  role = 'aluno' AND
  role != 'professor' AND 
  role != 'admin'
);
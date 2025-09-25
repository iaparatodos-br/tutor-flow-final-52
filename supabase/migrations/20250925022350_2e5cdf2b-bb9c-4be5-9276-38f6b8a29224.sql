-- Corrigir completamente a recursão infinita nas políticas RLS da tabela profiles
-- Remover TODAS as políticas e recriar de forma mais segura

-- Desabilitar RLS temporariamente para limpeza completa
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Remover TODAS as políticas existentes na tabela profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own professor profile" ON public.profiles;
DROP POLICY IF EXISTS "Teachers can create student profiles" ON public.profiles;
DROP POLICY IF EXISTS "Professores podem ver perfis vinculados" ON public.profiles;
DROP POLICY IF EXISTS "Professores podem atualizar perfis vinculados" ON public.profiles;
DROP POLICY IF EXISTS "Professores podem excluir perfis vinculados" ON public.profiles;
DROP POLICY IF EXISTS "Alunos podem ver perfis dos seus professores" ON public.profiles;

-- Reabilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Criar políticas básicas e seguras sem recursão
-- 1. Usuários podem ver e atualizar seus próprios perfis
CREATE POLICY "profiles_own_select" ON public.profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_own_update" ON public.profiles
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 2. Política para criação de perfis de professor (simplificada)
CREATE POLICY "profiles_professor_insert" ON public.profiles
FOR INSERT WITH CHECK (
  auth.uid() = id AND 
  role = 'professor'
);

-- 3. Política para criação de perfis de aluno (simplificada)
CREATE POLICY "profiles_student_insert" ON public.profiles
FOR INSERT WITH CHECK (
  role = 'aluno' AND
  role != 'professor' AND 
  role != 'admin'
);

-- 4. Políticas para relações professor-aluno (usando joins diretos sem subconsultas)
CREATE POLICY "profiles_teacher_student_select" ON public.profiles
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.teacher_student_relationships
    WHERE (teacher_id = auth.uid() AND student_id = profiles.id)
    OR (student_id = auth.uid() AND teacher_id = profiles.id)
  )
);

CREATE POLICY "profiles_teacher_student_update" ON public.profiles
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.teacher_student_relationships
    WHERE teacher_id = auth.uid() AND student_id = profiles.id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.teacher_student_relationships
    WHERE teacher_id = auth.uid() AND student_id = profiles.id
  )
);

CREATE POLICY "profiles_teacher_student_delete" ON public.profiles
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.teacher_student_relationships
    WHERE teacher_id = auth.uid() AND student_id = profiles.id
  )
);
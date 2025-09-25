-- Corrigir políticas RLS que referenciam user_metadata de forma insegura
-- Remover políticas que usam auth.jwt() -> user_metadata

DROP POLICY IF EXISTS "Teachers can create student profiles with validation" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own professor profile" ON public.profiles;

-- Criar função segura para verificar se o usuário é professor
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Recriar política de criação de perfis de aluno (mais segura)
CREATE POLICY "Teachers can create student profiles with validation"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (
  -- Usar função security definer para evitar recursão
  public.get_current_user_role() = 'professor' AND
  role = 'aluno' AND
  role != 'professor' AND 
  role != 'admin'
);

-- Recriar política de criação de perfil professor (mais segura)
CREATE POLICY "Users can create their own professor profile"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (
  auth.uid() = id AND 
  role = 'professor'
);
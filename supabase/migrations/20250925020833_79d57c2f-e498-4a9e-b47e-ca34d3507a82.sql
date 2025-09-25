-- Corrigir recursão infinita nas políticas RLS da tabela profiles
-- Removendo políticas problemáticas e recriando com lógica correta

-- Remover a política que causa recursão infinita
DROP POLICY IF EXISTS "Teachers can create student profiles with validation" ON public.profiles;

-- Recrear a política usando auth.jwt() em vez de subconsulta na própria tabela
CREATE POLICY "Teachers can create student profiles with validation"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (
  -- Verificar se o usuário é professor através do JWT metadata
  (auth.jwt() ->> 'role' = 'professor' OR 
   (auth.jwt() -> 'user_metadata' ->> 'role') = 'professor') AND
  -- Garantir que só pode criar perfis de aluno
  role = 'aluno' AND
  -- Prevenir criação de outros tipos de perfil
  role != 'professor' AND 
  role != 'admin'
);

-- Também vamos simplificar outras políticas que podem causar problemas
-- Remover e recriar política de usuários verem seu próprio perfil
DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO public
USING (auth.uid() = id);

-- Remover e recriar política de atualização
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO public
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Simplificar política de criação de perfil professor
DROP POLICY IF EXISTS "Users can create their own professor profile" ON public.profiles;
CREATE POLICY "Users can create their own professor profile"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (
  auth.uid() = id AND 
  role = 'professor' AND
  -- Verificar no JWT se é professor
  (auth.jwt() ->> 'role' = 'professor' OR 
   (auth.jwt() -> 'user_metadata' ->> 'role') = 'professor')
);
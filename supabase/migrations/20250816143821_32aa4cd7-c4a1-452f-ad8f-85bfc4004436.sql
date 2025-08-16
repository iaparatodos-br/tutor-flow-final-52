-- 1) Helper functions to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.user_owns_material(p_material_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.id = p_material_id AND m.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_material_shared_with_user(p_material_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.material_access ma
    WHERE ma.material_id = p_material_id AND ma.student_id = auth.uid()
  );
$$;

-- 2) Recreate RLS policies with helper functions
-- MATERIALS
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'materials'
      AND policyname = 'Alunos podem ver materiais compartilhados com eles'
  ) THEN
    EXECUTE 'DROP POLICY "Alunos podem ver materiais compartilhados com eles" ON public.materials';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'materials'
      AND policyname = 'Professores podem gerenciar seus materiais'
  ) THEN
    EXECUTE 'DROP POLICY "Professores podem gerenciar seus materiais" ON public.materials';
  END IF;
END $$;

-- Teacher full control
CREATE POLICY "Professores podem gerenciar seus materiais"
ON public.materials
FOR ALL
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- Students can view materials shared with them (no recursion)
CREATE POLICY "Alunos podem ver materiais compartilhados com eles"
ON public.materials
FOR SELECT
USING (public.is_material_shared_with_user(id));

-- MATERIAL_ACCESS
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'material_access'
      AND policyname = 'Alunos podem ver seus acessos'
  ) THEN
    EXECUTE 'DROP POLICY "Alunos podem ver seus acessos" ON public.material_access';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'material_access'
      AND policyname = 'Professores podem gerenciar acessos aos seus materiais'
  ) THEN
    EXECUTE 'DROP POLICY "Professores podem gerenciar acessos aos seus materiais" ON public.material_access';
  END IF;
END $$;

-- Students can view their own access records
CREATE POLICY "Alunos podem ver seus acessos"
ON public.material_access
FOR SELECT
USING (auth.uid() = student_id);

-- Teachers can manage access for their own materials using helper function
CREATE POLICY "Professores podem gerenciar acessos aos seus materiais"
ON public.material_access
FOR ALL
USING (public.user_owns_material(material_id))
WITH CHECK (public.user_owns_material(material_id));

-- Corrigir recursão infinita entre classes e class_participants
-- Criar função SECURITY DEFINER para verificar propriedade de aula sem passar por RLS

CREATE OR REPLACE FUNCTION public.is_class_owned_by_teacher(p_class_id uuid, p_teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes 
    WHERE id = p_class_id 
      AND teacher_id = p_teacher_id
  );
$$;

-- Remover políticas recursivas de class_participants
DROP POLICY IF EXISTS "Professores podem gerenciar participantes de suas aulas" ON class_participants;
DROP POLICY IF EXISTS "professores_veem_todas_participacoes" ON class_participants;

-- Criar novas políticas não-recursivas para class_participants
CREATE POLICY "professor_views_own_class_participants"
ON class_participants 
FOR SELECT
TO authenticated
USING (public.is_class_owned_by_teacher(class_id, auth.uid()));

CREATE POLICY "professor_manages_own_class_participants"
ON class_participants 
FOR ALL
TO authenticated
USING (public.is_class_owned_by_teacher(class_id, auth.uid()))
WITH CHECK (public.is_class_owned_by_teacher(class_id, auth.uid()));

-- Remover política recursiva de classes
DROP POLICY IF EXISTS "alunos_veem_suas_aulas" ON classes;

-- Criar nova política não-recursiva para classes
CREATE POLICY "users_view_relevant_classes"
ON classes 
FOR SELECT
TO authenticated
USING (
  teacher_id = auth.uid() 
  OR public.is_student_in_class(id, auth.uid())
);
-- Corrigir recursão infinita na política RLS de profiles
-- Criar função SECURITY DEFINER para buscar colegas de aula em grupo sem passar por RLS
CREATE OR REPLACE FUNCTION public.get_group_class_classmates(_user_id uuid)
RETURNS TABLE(classmate_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT cp2.student_id
  FROM class_participants cp1
  INNER JOIN class_participants cp2 ON cp1.class_id = cp2.class_id
  INNER JOIN classes c ON cp1.class_id = c.id
  WHERE cp1.student_id = _user_id
    AND cp2.student_id <> _user_id
    AND c.is_group_class = true;
END;
$$;

-- Remover política recursiva atual de profiles
DROP POLICY IF EXISTS "Students can view profiles of classmates in group classes" ON public.profiles;

-- Recriar política usando a função SECURITY DEFINER (não recursiva)
CREATE POLICY "Students can view profiles of classmates in group classes"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT classmate_id 
    FROM public.get_group_class_classmates(auth.uid())
  )
);
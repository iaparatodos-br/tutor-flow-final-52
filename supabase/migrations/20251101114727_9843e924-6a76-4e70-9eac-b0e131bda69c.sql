-- Remover política problemática que causa recursão
DROP POLICY IF EXISTS students_view_group_class_participants ON public.class_participants;

-- Criar função SECURITY DEFINER para verificar participação em aula em grupo
-- sem disparar políticas RLS (evita recursão)
CREATE OR REPLACE FUNCTION public.is_participant_in_group_class(
  _user_id uuid,
  _class_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM class_participants cp
    JOIN classes c ON c.id = cp.class_id
    WHERE cp.class_id = _class_id
      AND cp.student_id = _user_id
      AND c.is_group_class = true
  );
$$;

-- Recriar política usando a função SECURITY DEFINER
CREATE POLICY "students_view_group_class_participants"
ON public.class_participants
FOR SELECT
TO authenticated
USING (
  public.is_participant_in_group_class(auth.uid(), class_id)
  AND status = ANY (ARRAY['pendente'::text, 'confirmada'::text, 'concluida'::text, 'cancelada'::text])
);

-- Garantir índices para performance (IF NOT EXISTS evita erro se já existirem)
CREATE INDEX IF NOT EXISTS idx_class_participants_class_id ON public.class_participants(class_id);
CREATE INDEX IF NOT EXISTS idx_class_participants_student_id ON public.class_participants(student_id);
CREATE INDEX IF NOT EXISTS idx_classes_is_group_class ON public.classes(id) WHERE is_group_class = true;
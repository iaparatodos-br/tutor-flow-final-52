-- Permitir alunos verem TODOS os participantes de aulas em grupo
-- nas quais eles participam (sem afetar aulas individuais)
CREATE POLICY "students_view_group_class_participants"
ON public.class_participants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM class_participants cp_self
    JOIN classes c ON c.id = cp_self.class_id
    WHERE
      cp_self.class_id = class_participants.class_id
      AND cp_self.student_id = auth.uid()
      AND c.is_group_class = true
  )
  AND status = ANY (ARRAY['pendente'::text, 'confirmada'::text, 'concluida'::text, 'cancelada'::text])
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_class_participants_class_id ON public.class_participants(class_id);
CREATE INDEX IF NOT EXISTS idx_class_participants_student_id ON public.class_participants(student_id);
CREATE INDEX IF NOT EXISTS idx_classes_is_group_class ON public.classes(id) WHERE is_group_class = true;
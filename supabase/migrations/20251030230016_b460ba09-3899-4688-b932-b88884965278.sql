-- Corrigir recursão infinita na política RLS de class_participants
-- Remover a política recursiva atual
DROP POLICY IF EXISTS "alunos_veem_participacoes_ativas" ON public.class_participants;

-- Recriar a política de forma não recursiva
CREATE POLICY "alunos_veem_participacoes_ativas" ON public.class_participants
FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()
  AND status = ANY (ARRAY['pendente'::text, 'confirmada'::text, 'concluida'::text, 'cancelada'::text])
);
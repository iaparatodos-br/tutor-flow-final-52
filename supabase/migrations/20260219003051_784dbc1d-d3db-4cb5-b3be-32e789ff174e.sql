-- Fix: Adicionar 'aguardando_pagamento' à RLS policy de alunos em class_participants
DROP POLICY IF EXISTS "alunos_veem_participacoes_ativas" ON public.class_participants;

CREATE POLICY "alunos_veem_participacoes_ativas"
ON public.class_participants
FOR SELECT
USING (
  student_id = auth.uid()
  AND status = ANY (ARRAY[
    'pendente'::text,
    'confirmada'::text,
    'concluida'::text,
    'cancelada'::text,
    'aguardando_pagamento'::text
  ])
);

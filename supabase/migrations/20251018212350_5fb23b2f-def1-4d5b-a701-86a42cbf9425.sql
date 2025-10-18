-- Permitir alunos verem todos os participantes de suas aulas em grupo
DROP POLICY IF EXISTS "alunos_veem_participacoes_ativas" ON class_participants;

CREATE POLICY "alunos_veem_participacoes_ativas"
ON class_participants
FOR SELECT
USING (
  (
    -- Aluno vê suas próprias participações
    student_id = auth.uid()
  ) OR (
    -- Aluno vê todos os participantes de aulas em grupo onde ele participa
    class_id IN (
      SELECT class_id 
      FROM class_participants 
      WHERE student_id = auth.uid()
    )
  )
  AND 
  status = ANY (ARRAY['pendente'::text, 'confirmada'::text, 'concluida'::text, 'cancelada'::text])
);
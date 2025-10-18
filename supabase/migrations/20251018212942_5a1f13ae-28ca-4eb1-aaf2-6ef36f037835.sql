-- Corrigir recursão infinita em RLS de class_participants
-- Criar função security definer para retornar class_ids do usuário sem recursão
CREATE OR REPLACE FUNCTION get_user_class_ids(_user_id uuid)
RETURNS TABLE(class_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT class_id
  FROM class_participants
  WHERE student_id = _user_id
$$;

-- Recriar política usando a função para evitar recursão
DROP POLICY IF EXISTS "alunos_veem_participacoes_ativas" ON class_participants;

CREATE POLICY "alunos_veem_participacoes_ativas"
ON class_participants
FOR SELECT
USING (
  (
    -- Aluno vê suas próprias participações
    student_id = auth.uid()
  ) OR (
    -- Aluno vê todos os participantes de suas aulas usando função security definer
    class_id IN (
      SELECT class_id FROM get_user_class_ids(auth.uid())
    )
  )
  AND 
  status = ANY (ARRAY['pendente'::text, 'confirmada'::text, 'concluida'::text, 'cancelada'::text])
);
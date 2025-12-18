-- Correção 10.6: Atualizar constraint UNIQUE para suportar responsável + dependente na mesma aula
-- O índice antigo (class_id, student_id) impedia que Maria e seu dependente Erik 
-- participassem da mesma aula, pois ambos têm o mesmo student_id

-- Remover a CONSTRAINT única antiga (não apenas o índice)
ALTER TABLE public.class_participants 
DROP CONSTRAINT IF EXISTS class_participants_class_id_student_id_key;

-- Criar novo índice único que considera dependent_id
-- Usamos COALESCE para tratar NULL como string vazia, permitindo:
-- (class_id, student_id, '') - aluno normal ou responsável participando diretamente
-- (class_id, student_id, 'dep-uuid') - dependente participando
CREATE UNIQUE INDEX class_participants_class_student_dependent_key 
ON public.class_participants (class_id, student_id, COALESCE(dependent_id::text, ''));
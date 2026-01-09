
-- Limpar TODAS as faturas do aluno para re-testar
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
);
DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';

-- Garantir que aulas de teste NÃO estão marcadas como cobradas
UPDATE class_participants
SET charge_applied = false
WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
AND class_id IN (
  SELECT id FROM classes WHERE notes LIKE '%TEST 6.1%'
);

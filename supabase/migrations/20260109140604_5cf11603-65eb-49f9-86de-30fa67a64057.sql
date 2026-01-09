-- Corrigir teacher_id das aulas de teste para o professor correto
UPDATE classes 
SET teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
WHERE notes LIKE '%TEST 6.1%';

-- Atualizar mensalidades de teste também
UPDATE monthly_subscriptions
SET teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
WHERE name LIKE '%TEST 6.1%';

-- Limpar faturas para re-testar
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
);
DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';
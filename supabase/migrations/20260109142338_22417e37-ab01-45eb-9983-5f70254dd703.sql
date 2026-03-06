-- =====================================================
-- LIMPEZA COMPLETA das aulas para ambiente de teste limpo
-- =====================================================

-- Remover participações de aulas antigas
DELETE FROM class_participants 
WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
AND class_id NOT IN (
  '62100001-0001-0001-0001-000000000001',
  '62100001-0001-0001-0001-000000000002',
  '62100001-0001-0001-0001-000000000003'
);

-- Remover as aulas do teste de seeding anterior
DELETE FROM classes 
WHERE id IN (
  'f3067470-8520-4eb8-a9b7-25eba3fbc67f',
  '0767bc5f-2cd1-4f14-b290-e3a57e18cfcd',
  'c10a0a8d-bb9d-4580-9864-1885a7711924',
  '2c8c2d75-9e69-4fba-baa8-965d2779d767'
);

-- Limpar todas as faturas do aluno
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
);
DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';
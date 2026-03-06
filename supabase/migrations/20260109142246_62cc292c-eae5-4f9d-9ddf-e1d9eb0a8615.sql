-- =====================================================
-- LIMPEZA COMPLETA para testes 6.2.x
-- =====================================================

-- Limpar todas as faturas do Senhor Erik Jr.
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
);
DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';

-- Desativar TODAS as atribuições de mensalidade deste aluno
UPDATE student_monthly_subscriptions 
SET is_active = false, ends_at = NOW()
WHERE relationship_id = 'a69b061c-b0d6-424f-a3c3-c3dc1c218d73';

-- Atribuir ao plano 6.1.1 (R$0 + 2 aulas limite + R$10/excedente)
INSERT INTO student_monthly_subscriptions (
  id, subscription_id, relationship_id, starts_at, is_active
) VALUES (
  gen_random_uuid(),
  'f795f43e-d867-44bd-b6ce-1d58086d8668',  -- [TEST 6.1.1] Plano Grátis com Limite
  'a69b061c-b0d6-424f-a3c3-c3dc1c218d73',  -- Senhor Erik Jr.
  '2025-12-09',
  true
);

-- Limpar faturas do Senhor Erik Jr.
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
);
DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';

-- Desativar atribuição atual
UPDATE student_monthly_subscriptions 
SET is_active = false, ends_at = NOW()
WHERE relationship_id = 'a69b061c-b0d6-424f-a3c3-c3dc1c218d73'
AND is_active = true;

-- Atribuir ao plano 6.1.3 (R$100 + 2 aulas + R$0/excedente)
INSERT INTO student_monthly_subscriptions (
  id, subscription_id, relationship_id, starts_at, is_active
) VALUES (
  gen_random_uuid(),
  '14f80260-b588-4bde-ba82-5f5a8fd0bb3a',  -- TEST 6.1.3 Sem Cobrança Extra
  'a69b061c-b0d6-424f-a3c3-c3dc1c218d73',  -- Senhor Erik Jr.
  '2025-12-09',
  true
);

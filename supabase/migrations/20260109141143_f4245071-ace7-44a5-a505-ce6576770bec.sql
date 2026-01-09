
-- Limpar faturas do Senhor Erik Jr.
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
);
DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';

-- Desativar atribuição atual do Senhor Erik Jr. (relationship a69b061c...)
UPDATE student_monthly_subscriptions 
SET is_active = false, ends_at = NOW()
WHERE relationship_id = 'a69b061c-b0d6-424f-a3c3-c3dc1c218d73'
AND is_active = true;

-- Atribuir Senhor Erik Jr. ao plano 6.1.2
INSERT INTO student_monthly_subscriptions (
  id, subscription_id, relationship_id, starts_at, is_active
) VALUES (
  gen_random_uuid(),
  '5114dc11-d11b-4197-8ec7-d80f582955d4',  -- TEST 6.1.2 Tudo Excedente
  'a69b061c-b0d6-424f-a3c3-c3dc1c218d73',  -- Senhor Erik Jr. relationship
  '2025-12-09',
  true
);

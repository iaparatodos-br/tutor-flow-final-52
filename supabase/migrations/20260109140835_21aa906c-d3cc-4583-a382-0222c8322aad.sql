
-- Limpar faturas anteriores
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
);
DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';

-- Desativar atribuição anterior (se existir)
UPDATE student_monthly_subscriptions 
SET is_active = false, ends_at = NOW()
WHERE relationship_id = '44751371-e5d9-442d-a383-550f5fbe9883'
AND is_active = true;

-- Atribuir aluno ao plano 6.1.2 (Tudo Excedente: R$50 + R$15/aula, max_classes=0)
INSERT INTO student_monthly_subscriptions (
  id, subscription_id, relationship_id, starts_at, is_active
) VALUES (
  gen_random_uuid(),
  '5114dc11-d11b-4197-8ec7-d80f582955d4',  -- TEST 6.1.2
  '44751371-e5d9-442d-a383-550f5fbe9883',
  '2025-12-09',
  true
);

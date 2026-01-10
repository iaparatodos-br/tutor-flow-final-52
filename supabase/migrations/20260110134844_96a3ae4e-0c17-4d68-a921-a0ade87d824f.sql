
-- ============================================
-- CRIAR ATRIBUIÇÕES PARA TESTES 6.5.1 e 6.5.2
-- ============================================

-- Desativar qualquer atribuição ativa anterior para Erik e Senhor Erik
UPDATE student_monthly_subscriptions
SET is_active = false, ends_at = NOW()
WHERE relationship_id IN (
  '0a235da7-c110-4f81-852e-0c4aa42247f0',  -- Erik
  '88adb2d4-8ef1-4303-ae23-db1c7aedccd5'   -- Senhor Erik
)
AND is_active = true;

-- 6.5.1: Atribuir Erik ao Plano Ilimitado (sem ON CONFLICT, usar novo UUID)
INSERT INTO student_monthly_subscriptions (subscription_id, relationship_id, starts_at, is_active)
VALUES (
  'aaaa5501-5501-5501-5501-aaaaaaaaa501',  -- Plano Ilimitado
  '0a235da7-c110-4f81-852e-0c4aa42247f0',  -- Erik
  DATE_TRUNC('month', CURRENT_DATE),
  true
);

-- 6.5.2: Atribuir Senhor Erik ao Plano Dia 31
INSERT INTO student_monthly_subscriptions (subscription_id, relationship_id, starts_at, is_active)
VALUES (
  'aaaa5502-5502-5502-5502-aaaaaaaaa502',  -- Plano Dia 31
  '88adb2d4-8ef1-4303-ae23-db1c7aedccd5',  -- Senhor Erik
  DATE_TRUNC('month', CURRENT_DATE),
  true
);

-- Ajustar billing_day de Erik para hoje (dia 10)
UPDATE teacher_student_relationships
SET billing_day = EXTRACT(DAY FROM CURRENT_DATE)::INTEGER
WHERE id = '0a235da7-c110-4f81-852e-0c4aa42247f0';

-- Ajustar billing_day de Senhor Erik para 31 (teste mês curto)
UPDATE teacher_student_relationships
SET billing_day = 31
WHERE id = '88adb2d4-8ef1-4303-ae23-db1c7aedccd5';

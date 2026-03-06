
-- ============================================
-- TEST 6.5: EDGE CASES
-- 6.5.1: Plano Ilimitado (max_classes = NULL)
-- 6.5.2: billing_day = 31 em mês curto
-- ============================================

-- 6.5.1: Criar Plano Ilimitado
INSERT INTO monthly_subscriptions (id, teacher_id, name, description, price, max_classes, overage_price, is_active)
VALUES (
  'aaaa5501-5501-5501-5501-aaaaaaaaa501',
  '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  '[TEST 6.5.1] Plano Ilimitado',
  'Plano sem limite de aulas - max_classes = NULL',
  500.00,
  NULL,  -- ILIMITADO
  NULL,  -- Sem preço de excedente
  true
)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  max_classes = EXCLUDED.max_classes,
  overage_price = EXCLUDED.overage_price;

-- 6.5.2: Criar Plano com billing_day = 31
INSERT INTO monthly_subscriptions (id, teacher_id, name, description, price, max_classes, overage_price, is_active)
VALUES (
  'aaaa5502-5502-5502-5502-aaaaaaaaa502',
  '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  '[TEST 6.5.2] Plano Dia 31',
  'Teste de billing_day = 31 em meses curtos',
  150.00,
  4,
  20.00,
  true
)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  max_classes = EXCLUDED.max_classes,
  overage_price = EXCLUDED.overage_price;

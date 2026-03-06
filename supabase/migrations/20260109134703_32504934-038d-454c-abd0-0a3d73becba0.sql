-- ============================================
-- Teste Edge Cases 6.1.1, 6.1.2 e 6.1.3
-- ============================================

-- 1. Criar plano de teste 6.1.1: R$ 0 com limite de aulas
INSERT INTO monthly_subscriptions (
  teacher_id,
  name,
  description,
  price,
  max_classes,
  overage_price,
  is_active
) VALUES (
  '47f7d240-df07-4815-b881-a4002d1298fb',
  '[TEST 6.1.1] Plano Grátis com Limite',
  'Teste: R$0 base, 2 aulas incluídas, R$10 por excedente',
  0.00,
  2,
  10.00,
  true
);

-- 2. Criar plano de teste 6.1.2: Tudo excedente
INSERT INTO monthly_subscriptions (
  teacher_id,
  name,
  description,
  price,
  max_classes,
  overage_price,
  is_active
) VALUES (
  '47f7d240-df07-4815-b881-a4002d1298fb',
  '[TEST 6.1.2] Tudo Excedente',
  'Teste: R$50 base, 0 aulas incluídas, R$15 por aula',
  50.00,
  0,
  15.00,
  true
);

-- 3. Criar plano de teste 6.1.3: Sem cobrança extra
INSERT INTO monthly_subscriptions (
  teacher_id,
  name,
  description,
  price,
  max_classes,
  overage_price,
  is_active
) VALUES (
  '47f7d240-df07-4815-b881-a4002d1298fb',
  '[TEST 6.1.3] Sem Cobrança Extra',
  'Teste: R$100 base, 2 aulas incluídas, R$0 excedente',
  100.00,
  2,
  0.00,
  true
);

-- 4. Desativar atribuição atual do Senhor Erik Jr. (se existir)
UPDATE student_monthly_subscriptions 
SET is_active = false, ends_at = NOW()
WHERE relationship_id = 'a69b061c-b0d6-424f-a3c3-c3dc1c218d73'
  AND is_active = true;

-- 5. Atribuir Senhor Erik Jr. ao plano 6.1.1
INSERT INTO student_monthly_subscriptions (
  subscription_id,
  relationship_id,
  starts_at,
  is_active
) 
SELECT 
  id,
  'a69b061c-b0d6-424f-a3c3-c3dc1c218d73',
  (CURRENT_DATE - INTERVAL '25 days')::date,
  true
FROM monthly_subscriptions 
WHERE name = '[TEST 6.1.1] Plano Grátis com Limite'
  AND teacher_id = '47f7d240-df07-4815-b881-a4002d1298fb';

-- 6. Atualizar billing_day para hoje
UPDATE teacher_student_relationships
SET billing_day = EXTRACT(DAY FROM CURRENT_DATE)::int
WHERE id = 'a69b061c-b0d6-424f-a3c3-c3dc1c218d73';

-- 7. Criar 4 aulas de teste concluídas
DO $$
DECLARE
  v_service_id uuid;
  v_student_id uuid;
  v_class_id uuid;
BEGIN
  SELECT id INTO v_service_id 
  FROM class_services 
  WHERE teacher_id = '47f7d240-df07-4815-b881-a4002d1298fb' 
    AND is_active = true 
  LIMIT 1;
  
  SELECT student_id INTO v_student_id 
  FROM teacher_student_relationships 
  WHERE id = 'a69b061c-b0d6-424f-a3c3-c3dc1c218d73';

  FOR i IN 1..4 LOOP
    INSERT INTO classes (
      teacher_id,
      class_date,
      duration_minutes,
      status,
      service_id,
      is_group_class,
      is_experimental,
      notes
    ) VALUES (
      '47f7d240-df07-4815-b881-a4002d1298fb',
      NOW() - (i * INTERVAL '5 days'),
      60,
      'concluida',
      v_service_id,
      false,
      false,
      '[TEST 6.1] Aula de teste edge case'
    ) RETURNING id INTO v_class_id;
    
    INSERT INTO class_participants (
      class_id,
      student_id,
      status,
      completed_at
    ) VALUES (
      v_class_id,
      v_student_id,
      'concluida',
      NOW() - (i * INTERVAL '5 days')
    );
  END LOOP;
END $$;
-- ================================================================
-- CENÁRIO 6.4: Multi-Professor
-- ================================================================

-- 1.1 Criar business_profile para erik
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM business_profiles 
    WHERE user_id = '36c1a4ef-e55f-4303-b4b3-2d726d0403ac'
  ) THEN
    INSERT INTO business_profiles (id, user_id, business_name, stripe_connect_id)
    VALUES (
      'aaaa6400-6400-6400-6400-000000000001',
      '36c1a4ef-e55f-4303-b4b3-2d726d0403ac',
      'Erik Studio Test',
      'acct_test_erik_6400'
    );
  END IF;
END $$;

-- 1.2 Vincular relationship de erik ao business_profile
UPDATE teacher_student_relationships 
SET business_profile_id = (
  SELECT id FROM business_profiles 
  WHERE user_id = '36c1a4ef-e55f-4303-b4b3-2d726d0403ac' 
  LIMIT 1
)
WHERE id = 'b0eaea15-ddf9-4cb6-b800-eb328997975c';

-- 1.3 Criar class_service para erik (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM class_services 
    WHERE teacher_id = '36c1a4ef-e55f-4303-b4b3-2d726d0403ac' AND is_active = true
  ) THEN
    INSERT INTO class_services (id, teacher_id, name, price, duration_minutes, is_active, is_default)
    VALUES (
      'aaaa6400-6400-6400-6400-000000000002',
      '36c1a4ef-e55f-4303-b4b3-2d726d0403ac',
      'Aula Erik Test',
      100.00,
      60,
      true,
      true
    );
  END IF;
END $$;

-- 1.4 Desativar qualquer mensalidade anterior de erik para Erik Senior
UPDATE student_monthly_subscriptions 
SET is_active = false, ends_at = NOW()
WHERE relationship_id = 'b0eaea15-ddf9-4cb6-b800-eb328997975c'
AND is_active = true;

-- 1.5 Criar mensalidade para Professor erik
INSERT INTO monthly_subscriptions (id, teacher_id, name, description, price, max_classes, overage_price, is_active)
VALUES (
  'aaaa6400-6400-6400-6400-000000000003',
  '36c1a4ef-e55f-4303-b4b3-2d726d0403ac',
  '[TEST 6.4] Plano Erik',
  'Plano de teste para cenário multi-professor',
  200.00,
  5,
  25.00,
  true
);

-- 1.6 Atribuir Erik Senior ao plano de erik
INSERT INTO student_monthly_subscriptions (id, subscription_id, relationship_id, starts_at, is_active)
VALUES (
  'aaaa6400-6400-6400-6400-000000000004',
  'aaaa6400-6400-6400-6400-000000000003',
  'b0eaea15-ddf9-4cb6-b800-eb328997975c',
  CURRENT_DATE - INTERVAL '30 days',
  true
);

-- ================================================================
-- PASSO 2: Limpar dados de teste anteriores
-- ================================================================

DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE teacher_id IN (
    '51a6b44b-cd23-4b68-b345-ea9806ee5492', 
    '36c1a4ef-e55f-4303-b4b3-2d726d0403ac'
  )
);
DELETE FROM invoices WHERE teacher_id IN (
  '51a6b44b-cd23-4b68-b345-ea9806ee5492', 
  '36c1a4ef-e55f-4303-b4b3-2d726d0403ac'
);
DELETE FROM class_participants WHERE class_id IN (
  SELECT id FROM classes WHERE teacher_id IN (
    '51a6b44b-cd23-4b68-b345-ea9806ee5492', 
    '36c1a4ef-e55f-4303-b4b3-2d726d0403ac'
  )
);
DELETE FROM classes WHERE teacher_id IN (
  '51a6b44b-cd23-4b68-b345-ea9806ee5492', 
  '36c1a4ef-e55f-4303-b4b3-2d726d0403ac'
);

-- ================================================================
-- PASSO 3: Criar aulas para Professor erik (3 aulas)
-- ================================================================

INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 'aaaa6401-6401-6401-6401-000000000001', '36c1a4ef-e55f-4303-b4b3-2d726d0403ac',
  (CURRENT_DATE - INTERVAL '12 days') + TIME '09:00:00', 60, 'concluida', false, id
FROM class_services WHERE teacher_id = '36c1a4ef-e55f-4303-b4b3-2d726d0403ac' AND is_active = true LIMIT 1;

INSERT INTO class_participants (class_id, student_id, status, completed_at)
VALUES ('aaaa6401-6401-6401-6401-000000000001', '541fd25e-2528-4e98-9572-589de36f940a', 'concluida', NOW());

INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 'aaaa6401-6401-6401-6401-000000000002', '36c1a4ef-e55f-4303-b4b3-2d726d0403ac',
  (CURRENT_DATE - INTERVAL '10 days') + TIME '09:00:00', 60, 'concluida', false, id
FROM class_services WHERE teacher_id = '36c1a4ef-e55f-4303-b4b3-2d726d0403ac' AND is_active = true LIMIT 1;

INSERT INTO class_participants (class_id, student_id, status, completed_at)
VALUES ('aaaa6401-6401-6401-6401-000000000002', '541fd25e-2528-4e98-9572-589de36f940a', 'concluida', NOW());

INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 'aaaa6401-6401-6401-6401-000000000003', '36c1a4ef-e55f-4303-b4b3-2d726d0403ac',
  (CURRENT_DATE - INTERVAL '8 days') + TIME '09:00:00', 60, 'concluida', false, id
FROM class_services WHERE teacher_id = '36c1a4ef-e55f-4303-b4b3-2d726d0403ac' AND is_active = true LIMIT 1;

INSERT INTO class_participants (class_id, student_id, status, completed_at)
VALUES ('aaaa6401-6401-6401-6401-000000000003', '541fd25e-2528-4e98-9572-589de36f940a', 'concluida', NOW());

-- ================================================================
-- PASSO 4: Criar aulas para Professor Guilherme (2 aulas)
-- ================================================================

INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 'bbbb6402-6402-6402-6402-000000000001', '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  (CURRENT_DATE - INTERVAL '11 days') + TIME '14:00:00', 60, 'concluida', false, id
FROM class_services WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492' AND is_active = true LIMIT 1;

INSERT INTO class_participants (class_id, student_id, status, completed_at)
VALUES ('bbbb6402-6402-6402-6402-000000000001', '541fd25e-2528-4e98-9572-589de36f940a', 'concluida', NOW());

INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 'bbbb6402-6402-6402-6402-000000000002', '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  (CURRENT_DATE - INTERVAL '9 days') + TIME '14:00:00', 60, 'concluida', false, id
FROM class_services WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492' AND is_active = true LIMIT 1;

INSERT INTO class_participants (class_id, student_id, status, completed_at)
VALUES ('bbbb6402-6402-6402-6402-000000000002', '541fd25e-2528-4e98-9572-589de36f940a', 'concluida', NOW());
-- ============================================
-- Script de Seed para Teste de Mensalidades
-- ============================================
-- 
-- Este script cria dados de teste para validar o fluxo completo:
-- 1. Cria uma mensalidade de teste
-- 2. Atribui um aluno existente
-- 3. Opcionalmente cria aulas de teste
--
-- ATENÇÃO: Execute apenas em ambiente de desenvolvimento!
-- ============================================

-- ============================================
-- PARTE 1: Verificar dados existentes
-- ============================================

-- Listar professores disponíveis
SELECT id, name, email, role 
FROM profiles 
WHERE role = 'professor' 
LIMIT 5;

-- Listar relacionamentos professor-aluno disponíveis
SELECT 
  tsr.id as relationship_id,
  tsr.teacher_id,
  tsr.student_id,
  COALESCE(tsr.student_name, p.name) as student_name,
  tsr.billing_day
FROM teacher_student_relationships tsr
JOIN profiles p ON tsr.student_id = p.id
LIMIT 10;

-- ============================================
-- PARTE 2: Criar Mensalidade de Teste
-- ============================================

-- Substitua {TEACHER_ID} pelo ID do professor desejado
-- Exemplo: '47f7d240-df07-4815-b881-a4002d1298fb'

DO $$
DECLARE
  v_teacher_id uuid := '47f7d240-df07-4815-b881-a4002d1298fb'; -- ALTERAR
  v_subscription_id uuid;
  v_relationship_id uuid := '44751371-e5d9-442d-a383-550f5fbe9883'; -- ALTERAR
BEGIN
  -- Criar mensalidade
  INSERT INTO monthly_subscriptions (
    id, 
    teacher_id, 
    name, 
    description, 
    price, 
    max_classes, 
    overage_price, 
    is_active
  ) VALUES (
    gen_random_uuid(),
    v_teacher_id,
    'Plano Teste E2E',
    'Plano criado automaticamente para testes de integração',
    200.00,
    4,
    50.00,
    true
  ) RETURNING id INTO v_subscription_id;
  
  RAISE NOTICE 'Mensalidade criada: %', v_subscription_id;
  
  -- Atribuir aluno
  INSERT INTO student_monthly_subscriptions (
    id,
    subscription_id,
    relationship_id,
    starts_at,
    is_active
  ) VALUES (
    gen_random_uuid(),
    v_subscription_id,
    v_relationship_id,
    CURRENT_DATE,
    true
  );
  
  RAISE NOTICE 'Aluno vinculado com sucesso!';
END $$;

-- ============================================
-- PARTE 3: Verificar dados criados
-- ============================================

-- Ver mensalidades criadas
SELECT 
  id,
  name,
  price,
  max_classes,
  overage_price,
  is_active,
  created_at
FROM monthly_subscriptions
ORDER BY created_at DESC
LIMIT 5;

-- Ver atribuições
SELECT 
  sms.id,
  ms.name as subscription_name,
  tsr.student_id,
  COALESCE(tsr.student_name, p.name) as student_name,
  sms.starts_at,
  sms.is_active
FROM student_monthly_subscriptions sms
JOIN monthly_subscriptions ms ON sms.subscription_id = ms.id
JOIN teacher_student_relationships tsr ON sms.relationship_id = tsr.id
JOIN profiles p ON tsr.student_id = p.id
ORDER BY sms.created_at DESC
LIMIT 10;

-- ============================================
-- PARTE 4: Simular Aulas (Opcional)
-- ============================================

-- Para simular faturamento, crie aulas concluídas:
-- 
-- INSERT INTO classes (
--   teacher_id, 
--   class_date, 
--   duration_minutes, 
--   status,
--   service_id
-- ) VALUES (
--   '{TEACHER_ID}',
--   NOW() - INTERVAL '1 day',
--   60,
--   'concluida',
--   '{SERVICE_ID}'
-- ) RETURNING id;
--
-- INSERT INTO class_participants (
--   class_id,
--   student_id,
--   status
-- ) VALUES (
--   '{CLASS_ID}',
--   '{STUDENT_ID}',
--   'concluida'
-- );

-- ============================================
-- PARTE 5: Limpeza (Executar após testes)
-- ============================================

-- ATENÇÃO: Descomente para limpar dados de teste

-- UPDATE monthly_subscriptions 
-- SET is_active = false 
-- WHERE name LIKE 'Plano Teste%';

-- DELETE FROM student_monthly_subscriptions 
-- WHERE subscription_id IN (
--   SELECT id FROM monthly_subscriptions 
--   WHERE name LIKE 'Plano Teste%'
-- );

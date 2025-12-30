-- ============================================
-- QUERIES DE VALIDAÇÃO - SISTEMA DE MENSALIDADES
-- Execute no SQL Editor do Supabase para verificar integridade
-- ============================================

-- ========================================
-- V01: Verificar integridade de mensalidades
-- Espera-se: 0 registros
-- ========================================
SELECT id, name, teacher_id, created_at
FROM monthly_subscriptions 
WHERE name IS NULL OR teacher_id IS NULL;

-- ========================================
-- V02: Verificar regra limite/excedente
-- Mensalidades com limite devem ter preço de excedente
-- Espera-se: 0 registros (ou apenas planos com limite zero)
-- ========================================
SELECT id, name, max_classes, overage_price
FROM monthly_subscriptions 
WHERE max_classes IS NOT NULL 
  AND max_classes > 0
  AND overage_price IS NULL;

-- ========================================
-- V03: Verificar duplicatas de atribuição
-- Cada aluno deve ter no máximo 1 assinatura ativa por professor
-- Espera-se: 0 registros
-- ========================================
SELECT 
  relationship_id, 
  COUNT(*) as assignment_count,
  array_agg(subscription_id) as subscriptions
FROM student_monthly_subscriptions 
WHERE is_active = true
GROUP BY relationship_id 
HAVING COUNT(*) > 1;

-- ========================================
-- V04: Verificar faturas órfãs
-- Faturas de mensalidade devem ter subscription_id
-- Espera-se: 0 registros
-- ========================================
SELECT id, description, amount, created_at
FROM invoices 
WHERE invoice_type = 'monthly_subscription' 
  AND monthly_subscription_id IS NULL;

-- ========================================
-- V05: Verificar contagem de aulas do mês atual
-- Lista alunos com assinatura ativa e suas aulas
-- ========================================
SELECT 
  tsr.id as relationship_id,
  p.name as student_name,
  ms.name as subscription_name,
  ms.max_classes,
  public.count_completed_classes_in_month(
    tsr.teacher_id, 
    tsr.student_id, 
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 
    EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
  ) as classes_used,
  CASE 
    WHEN ms.max_classes IS NULL THEN 'Ilimitado'
    WHEN public.count_completed_classes_in_month(
      tsr.teacher_id, 
      tsr.student_id, 
      EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 
      EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
    ) > ms.max_classes THEN 'EXCEDENTE'
    ELSE 'OK'
  END as status
FROM teacher_student_relationships tsr
JOIN student_monthly_subscriptions sms ON tsr.id = sms.relationship_id
JOIN monthly_subscriptions ms ON sms.subscription_id = ms.id
JOIN profiles p ON tsr.student_id = p.id
WHERE sms.is_active = true
  AND ms.is_active = true;

-- ========================================
-- V06: Verificar valores de excedentes em faturas
-- Comparar com overage_price da mensalidade
-- ========================================
SELECT 
  i.id as invoice_id,
  i.description,
  ic.item_type,
  ic.amount as charged_amount,
  ms.overage_price as expected_price,
  CASE 
    WHEN ic.item_type = 'overage' AND ic.amount != ms.overage_price 
    THEN 'ERRO: Valor incorreto'
    ELSE 'OK'
  END as validation_status
FROM invoices i
JOIN invoice_classes ic ON i.id = ic.invoice_id
LEFT JOIN monthly_subscriptions ms ON i.monthly_subscription_id = ms.id
WHERE ic.item_type = 'overage';

-- ========================================
-- V07: Verificar LEFT JOIN funciona para mensalidades
-- Faturas de mensalidade podem não ter invoice_classes individuais
-- ========================================
SELECT 
  i.id,
  i.invoice_type,
  i.amount,
  i.description,
  COUNT(ic.id) as items_count
FROM invoices i
LEFT JOIN invoice_classes ic ON i.id = ic.invoice_id
WHERE i.invoice_type = 'monthly_subscription'
GROUP BY i.id, i.invoice_type, i.amount, i.description
ORDER BY i.created_at DESC
LIMIT 20;

-- ========================================
-- V08: Verificar cascade de desativação
-- Não devem existir atribuições ativas para mensalidades inativas
-- Espera-se: 0 registros
-- ========================================
SELECT 
  sms.id as assignment_id,
  sms.relationship_id,
  ms.id as subscription_id,
  ms.name as subscription_name,
  ms.is_active as subscription_active,
  sms.is_active as assignment_active
FROM student_monthly_subscriptions sms
JOIN monthly_subscriptions ms ON sms.subscription_id = ms.id
WHERE sms.is_active = true
  AND ms.is_active = false;

-- ========================================
-- ESTATÍSTICAS GERAIS
-- ========================================
SELECT 
  'Mensalidades Ativas' as metric,
  COUNT(*) as value
FROM monthly_subscriptions 
WHERE is_active = true

UNION ALL

SELECT 
  'Mensalidades Inativas' as metric,
  COUNT(*) as value
FROM monthly_subscriptions 
WHERE is_active = false

UNION ALL

SELECT 
  'Atribuições Ativas' as metric,
  COUNT(*) as value
FROM student_monthly_subscriptions 
WHERE is_active = true

UNION ALL

SELECT 
  'Faturas de Mensalidade' as metric,
  COUNT(*) as value
FROM invoices 
WHERE invoice_type = 'monthly_subscription'

UNION ALL

SELECT 
  'Faturas com Excedentes' as metric,
  COUNT(DISTINCT invoice_id) as value
FROM invoice_classes 
WHERE item_type = 'overage';

-- ========================================
-- EDGE CASES: Aulas antes de starts_at
-- Verificar aulas que devem ser cobradas avulsas
-- ========================================
SELECT 
  c.id as class_id,
  c.class_date,
  cp.student_id,
  sms.starts_at,
  CASE 
    WHEN c.class_date::date < sms.starts_at THEN 'Cobrar avulso'
    ELSE 'Incluir na franquia'
  END as billing_rule
FROM classes c
JOIN class_participants cp ON c.id = cp.class_id
JOIN teacher_student_relationships tsr ON cp.student_id = tsr.student_id AND c.teacher_id = tsr.teacher_id
JOIN student_monthly_subscriptions sms ON tsr.id = sms.relationship_id
WHERE sms.is_active = true
  AND cp.status = 'concluida'
  AND c.class_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY c.class_date DESC;

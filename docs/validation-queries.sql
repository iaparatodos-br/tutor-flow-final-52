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
WHERE invoice_type = 'monthly_subscription';

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
    ELSE 'Incluir na mensalidade'
  END as billing_rule
FROM classes c
JOIN class_participants cp ON c.id = cp.class_id
JOIN teacher_student_relationships tsr ON cp.student_id = tsr.student_id AND c.teacher_id = tsr.teacher_id
JOIN student_monthly_subscriptions sms ON tsr.id = sms.relationship_id
WHERE sms.is_active = true
  AND cp.status = 'concluida'
  AND c.class_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY c.class_date DESC;

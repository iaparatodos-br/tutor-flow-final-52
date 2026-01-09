
-- ================================================================
-- CORREÇÃO: SETUP PARA TESTES 6.3 (DEPENDENTES)
-- ================================================================
-- Usar Erik Senior (relationship: 0d2b4c9a-db16-4064-a575-90cd195128fc)
-- Desativar outras mensalidades para evitar conflitos
-- Usar billing_day diferente (dia 10)

-- 1. LIMPAR FATURAS E AULAS ANTERIORES
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
);
DELETE FROM invoices WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492';
DELETE FROM class_participants WHERE class_id IN (
  SELECT id FROM classes WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
);
DELETE FROM classes WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492';

-- 2. DESATIVAR TODAS AS MENSALIDADES DE OUTROS ALUNOS
UPDATE student_monthly_subscriptions 
SET is_active = false, ends_at = CURRENT_DATE
WHERE relationship_id IN (
  SELECT id FROM teacher_student_relationships 
  WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
    AND student_id != '541fd25e-2528-4e98-9572-589de36f940a'
);

-- 3. GARANTIR MENSALIDADE ATIVA APENAS PARA ERIK SENIOR
DELETE FROM student_monthly_subscriptions WHERE relationship_id = '0d2b4c9a-db16-4064-a575-90cd195128fc';

INSERT INTO student_monthly_subscriptions (subscription_id, relationship_id, starts_at, is_active)
VALUES ('f795f43e-d867-44bd-b6ce-1d58086d8668', '0d2b4c9a-db16-4064-a575-90cd195128fc', CURRENT_DATE - INTERVAL '15 days', true);

-- 4. ATUALIZAR billing_day PARA HOJE (APENAS ERIK SENIOR)
UPDATE teacher_student_relationships 
SET billing_day = EXTRACT(DAY FROM CURRENT_DATE)::int
WHERE id = '0d2b4c9a-db16-4064-a575-90cd195128fc';

-- Outros alunos com billing_day diferente
UPDATE teacher_student_relationships 
SET billing_day = 28
WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
  AND id != '0d2b4c9a-db16-4064-a575-90cd195128fc';

-- 5. CRIAR AULAS PARA CENÁRIO 6.3.1 e 6.3.2
-- Aula do responsável (Erik Senior)
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 
  'aaaaaaaa-6311-6311-6311-aaaaaaaaaaaa',
  '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  (CURRENT_DATE - INTERVAL '5 days') + TIME '10:00:00',
  60,
  'concluida',
  false,
  id
FROM class_services 
WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492' AND is_active = true
LIMIT 1;

INSERT INTO class_participants (class_id, student_id, dependent_id, status, completed_at)
VALUES ('aaaaaaaa-6311-6311-6311-aaaaaaaaaaaa', '541fd25e-2528-4e98-9572-589de36f940a', NULL, 'concluida', NOW());

-- Aula do Junior 1 (dependente de Erik Senior)
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 
  'bbbbbbbb-6311-6311-6311-bbbbbbbbbbbb',
  '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  (CURRENT_DATE - INTERVAL '3 days') + TIME '14:00:00',
  60,
  'concluida',
  false,
  id
FROM class_services 
WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492' AND is_active = true
LIMIT 1;

INSERT INTO class_participants (class_id, student_id, dependent_id, status, completed_at)
VALUES ('bbbbbbbb-6311-6311-6311-bbbbbbbbbbbb', '541fd25e-2528-4e98-9572-589de36f940a', '11111111-1111-1111-1111-111111111111', 'concluida', NOW());

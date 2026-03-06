
-- ================================================================
-- SETUP COMPLETO PARA TESTES 6.3 (DEPENDENTES)
-- ================================================================
-- Relationship correto: 0d2b4c9a-db16-4064-a575-90cd195128fc
-- Plano 6.1.1: f795f43e-d867-44bd-b6ce-1d58086d8668 (R$0, 2 aulas, R$10 excedente)

-- 1. LIMPAR DADOS ANTERIORES
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
);
DELETE FROM invoices WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492';
DELETE FROM class_participants WHERE class_id IN (
  SELECT id FROM classes WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
);
DELETE FROM classes WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492';
DELETE FROM dependents WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492';

-- 2. CRIAR DEPENDENTES DE TESTE
INSERT INTO dependents (id, name, responsible_id, teacher_id, birth_date)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Junior 1', '541fd25e-2528-4e98-9572-589de36f940a', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2015-01-15'),
  ('22222222-2222-2222-2222-222222222222', 'Junior 2', '541fd25e-2528-4e98-9572-589de36f940a', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2018-06-20');

-- 3. GARANTIR MENSALIDADE ATIVA (ID correto)
UPDATE student_monthly_subscriptions 
SET is_active = false, ends_at = CURRENT_DATE
WHERE relationship_id = '0d2b4c9a-db16-4064-a575-90cd195128fc';

INSERT INTO student_monthly_subscriptions (subscription_id, relationship_id, starts_at, is_active)
VALUES ('f795f43e-d867-44bd-b6ce-1d58086d8668', '0d2b4c9a-db16-4064-a575-90cd195128fc', CURRENT_DATE - INTERVAL '15 days', true);

-- 4. ATUALIZAR billing_day PARA HOJE
UPDATE teacher_student_relationships 
SET billing_day = EXTRACT(DAY FROM CURRENT_DATE)::int
WHERE id = '0d2b4c9a-db16-4064-a575-90cd195128fc';

-- 5. CRIAR AULAS PARA CENÁRIO 6.3.1 e 6.3.2
-- Aula do responsável
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

-- Aula do Junior 1
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

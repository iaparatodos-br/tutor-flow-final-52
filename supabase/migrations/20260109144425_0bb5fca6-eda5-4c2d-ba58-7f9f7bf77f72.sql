
-- ================================================================
-- CENÁRIO 6.3.3: Múltiplos dependentes na mesma franquia
-- ================================================================
-- 4 aulas de dependentes: 2 Junior 1 + 2 Junior 2
-- Limite: 2 aulas, Excedente: 2 aulas × R$10 = R$20

-- 1. LIMPAR FATURAS E AULAS ANTERIORES
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
);
DELETE FROM invoices WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492';
DELETE FROM class_participants WHERE class_id IN (
  SELECT id FROM classes WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
);
DELETE FROM classes WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492';

-- 2. CRIAR 4 AULAS DE DEPENDENTES
-- Junior 1 - Aula 1
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 'aaaaaaaa-6331-6331-6331-111111111111', '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  (CURRENT_DATE - INTERVAL '10 days') + TIME '10:00:00', 60, 'concluida', false, id
FROM class_services WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492' AND is_active = true LIMIT 1;

INSERT INTO class_participants (class_id, student_id, dependent_id, status, completed_at)
VALUES ('aaaaaaaa-6331-6331-6331-111111111111', '541fd25e-2528-4e98-9572-589de36f940a', '11111111-1111-1111-1111-111111111111', 'concluida', NOW());

-- Junior 1 - Aula 2
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 'bbbbbbbb-6331-6331-6331-222222222222', '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  (CURRENT_DATE - INTERVAL '8 days') + TIME '14:00:00', 60, 'concluida', false, id
FROM class_services WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492' AND is_active = true LIMIT 1;

INSERT INTO class_participants (class_id, student_id, dependent_id, status, completed_at)
VALUES ('bbbbbbbb-6331-6331-6331-222222222222', '541fd25e-2528-4e98-9572-589de36f940a', '11111111-1111-1111-1111-111111111111', 'concluida', NOW());

-- Junior 2 - Aula 1
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 'cccccccc-6331-6331-6331-333333333333', '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  (CURRENT_DATE - INTERVAL '6 days') + TIME '10:00:00', 60, 'concluida', false, id
FROM class_services WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492' AND is_active = true LIMIT 1;

INSERT INTO class_participants (class_id, student_id, dependent_id, status, completed_at)
VALUES ('cccccccc-6331-6331-6331-333333333333', '541fd25e-2528-4e98-9572-589de36f940a', '22222222-2222-2222-2222-222222222222', 'concluida', NOW());

-- Junior 2 - Aula 2
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, service_id)
SELECT 'dddddddd-6331-6331-6331-444444444444', '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  (CURRENT_DATE - INTERVAL '4 days') + TIME '14:00:00', 60, 'concluida', false, id
FROM class_services WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492' AND is_active = true LIMIT 1;

INSERT INTO class_participants (class_id, student_id, dependent_id, status, completed_at)
VALUES ('dddddddd-6331-6331-6331-444444444444', '541fd25e-2528-4e98-9572-589de36f940a', '22222222-2222-2222-2222-222222222222', 'concluida', NOW());

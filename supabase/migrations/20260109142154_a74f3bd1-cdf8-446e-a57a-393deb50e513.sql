-- =====================================================
-- CENÁRIO 6.2.1: Aula cancelada pelo aluno (NÃO conta)
-- =====================================================
-- Plano: R$0 + 2 aulas limite + R$10/excedente
-- 2 aulas concluídas + 1 cancelada = Deve cobrar R$0 (2 dentro do limite)

-- Teacher ID correto: 51a6b44b-cd23-4b68-b345-ea9806ee5492
-- Student ID: 07ae0cf4-a46a-42a7-95bd-59b747fed3df

-- Aula 1: Concluída
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_experimental, is_group_class)
VALUES ('62100001-0001-0001-0001-000000000001', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-15 10:00:00', 60, 'concluida', false, false);

INSERT INTO class_participants (id, class_id, student_id, status, completed_at)
VALUES ('62100001-0001-0001-0001-000000000011', '62100001-0001-0001-0001-000000000001', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'concluida', '2025-12-15 11:00:00');

-- Aula 2: Concluída
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_experimental, is_group_class)
VALUES ('62100001-0001-0001-0001-000000000002', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-16 10:00:00', 60, 'concluida', false, false);

INSERT INTO class_participants (id, class_id, student_id, status, completed_at)
VALUES ('62100001-0001-0001-0001-000000000012', '62100001-0001-0001-0001-000000000002', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'concluida', '2025-12-16 11:00:00');

-- Aula 3: Cancelada pelo aluno (NÃO deve contar)
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_experimental, is_group_class, cancellation_reason)
VALUES ('62100001-0001-0001-0001-000000000003', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-17 10:00:00', 60, 'cancelada', false, false, 'Aluno cancelou');

INSERT INTO class_participants (id, class_id, student_id, status, cancellation_reason, cancelled_at, charge_applied)
VALUES ('62100001-0001-0001-0001-000000000013', '62100001-0001-0001-0001-000000000003', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'cancelada', 'Aluno cancelou', NOW(), false);
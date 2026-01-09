-- =====================================================
-- CENÁRIO 6.2.2: Aula cancelada COM multa 
-- (multa NÃO afeta limite da mensalidade)
-- =====================================================
-- Limpar dados
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
);
DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';
DELETE FROM class_participants WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';
DELETE FROM classes WHERE id IN (
  '62100001-0001-0001-0001-000000000001',
  '62100001-0001-0001-0001-000000000002',
  '62100001-0001-0001-0001-000000000003'
);

-- Criar 2 aulas concluídas + 1 cancelada COM multa
-- Aula 1: Concluída
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_experimental, is_group_class)
VALUES ('62200001-0001-0001-0001-000000000001', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-15 10:00:00', 60, 'concluida', false, false);

INSERT INTO class_participants (id, class_id, student_id, status, completed_at)
VALUES ('62200001-0001-0001-0001-000000000011', '62200001-0001-0001-0001-000000000001', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'concluida', '2025-12-15 11:00:00');

-- Aula 2: Concluída
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_experimental, is_group_class)
VALUES ('62200001-0001-0001-0001-000000000002', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-16 10:00:00', 60, 'concluida', false, false);

INSERT INTO class_participants (id, class_id, student_id, status, completed_at)
VALUES ('62200001-0001-0001-0001-000000000012', '62200001-0001-0001-0001-000000000002', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'concluida', '2025-12-16 11:00:00');

-- Aula 3: Cancelada COM multa (charge_applied = true)
-- Esta aula NÃO deve contar no limite, mas a multa deve ser cobrada separadamente
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_experimental, is_group_class, cancellation_reason, charge_applied)
VALUES ('62200001-0001-0001-0001-000000000003', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-17 10:00:00', 60, 'cancelada', false, false, 'Cancelou em cima da hora', true);

INSERT INTO class_participants (id, class_id, student_id, status, cancellation_reason, cancelled_at, charge_applied)
VALUES ('62200001-0001-0001-0001-000000000013', '62200001-0001-0001-0001-000000000003', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'cancelada', 'Cancelou em cima da hora', NOW(), true);
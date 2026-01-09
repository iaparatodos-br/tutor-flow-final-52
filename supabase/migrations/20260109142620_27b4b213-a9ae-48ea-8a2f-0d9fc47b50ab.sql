-- CENÁRIO 6.2.3: Aula experimental (NÃO conta no limite)
DELETE FROM invoice_classes WHERE invoice_id IN (SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df');
DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';
DELETE FROM class_participants WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';
DELETE FROM classes WHERE id IN (
  '62200001-0001-0001-0001-000000000001',
  '62200001-0001-0001-0001-000000000002',
  '62200001-0001-0001-0001-000000000003'
);

-- 2 aulas normais + 1 experimental
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_experimental, is_group_class)
VALUES 
  ('62300001-0001-0001-0001-000000000001', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-15 10:00:00', 60, 'concluida', false, false),
  ('62300001-0001-0001-0001-000000000002', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-16 10:00:00', 60, 'concluida', false, false),
  ('62300001-0001-0001-0001-000000000003', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-17 10:00:00', 60, 'concluida', true, false);

INSERT INTO class_participants (id, class_id, student_id, status, completed_at) VALUES 
  ('62300001-0001-0001-0001-000000000011', '62300001-0001-0001-0001-000000000001', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'concluida', '2025-12-15 11:00:00'),
  ('62300001-0001-0001-0001-000000000012', '62300001-0001-0001-0001-000000000002', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'concluida', '2025-12-16 11:00:00'),
  ('62300001-0001-0001-0001-000000000013', '62300001-0001-0001-0001-000000000003', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'concluida', '2025-12-17 11:00:00');
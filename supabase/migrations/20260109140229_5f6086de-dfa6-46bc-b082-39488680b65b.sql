-- Limpar aulas antigas que não são de teste
DELETE FROM class_participants 
WHERE class_id IN (
  SELECT id FROM classes 
  WHERE teacher_id = '47f7d240-df07-4815-b881-a4002d1298fb'
    AND (notes IS NULL OR notes NOT LIKE '%TEST 6.1%')
    AND class_date::date BETWEEN '2025-12-01' AND '2025-12-15'
);

DELETE FROM classes 
WHERE teacher_id = '47f7d240-df07-4815-b881-a4002d1298fb'
  AND (notes IS NULL OR notes NOT LIKE '%TEST 6.1%')
  AND class_date::date BETWEEN '2025-12-01' AND '2025-12-15';

-- Limpar faturas para re-testar
DELETE FROM invoice_classes WHERE invoice_id IN (
  SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
);
DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';
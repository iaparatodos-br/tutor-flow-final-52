
-- Ajustar billing_day de Senhor Erik para hoje para testar
UPDATE teacher_student_relationships
SET billing_day = EXTRACT(DAY FROM CURRENT_DATE)::INTEGER
WHERE id = '88adb2d4-8ef1-4303-ae23-db1c7aedccd5';

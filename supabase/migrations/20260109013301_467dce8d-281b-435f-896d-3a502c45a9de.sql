
-- Alterar temporariamente o billing_day para 9 (hoje) para testar o Senhor Erik Jr
UPDATE teacher_student_relationships 
SET billing_day = 9
WHERE id = 'a69b061c-b0d6-424f-a3c3-c3dc1c218d73';

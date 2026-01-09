
-- Limpar aulas de teste antigas e criar novas que se encaixam no ciclo atual
-- Ciclo atual: 09/12/2025 a 08/01/2026
-- starts_at = 2025-12-05

-- Criar novo aluno de teste ou usar outro cenário:
-- Vou alterar o starts_at do Senhor Erik Jr para 10/12/2025 
-- E criar aulas em: 09/12 (ANTES starts_at), 10/12 (NO DIA starts_at), 11/12 (APÓS starts_at)

-- Primeiro: deletar as invoice_classes e invoices de teste
DELETE FROM invoice_classes 
WHERE invoice_id IN (
  SELECT id FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df'
);

DELETE FROM invoices WHERE student_id = '07ae0cf4-a46a-42a7-95bd-59b747fed3df';

-- Deletar participantes e aulas de teste
DELETE FROM class_participants WHERE id IN (
  '22222222-0001-0001-0001-000000000341',
  '22222222-0001-0001-0001-000000000342',
  '22222222-0001-0001-0001-000000000343'
);

DELETE FROM classes WHERE id IN (
  '11111111-0001-0001-0001-000000000341',
  '11111111-0001-0001-0001-000000000342',
  '11111111-0001-0001-0001-000000000343'
);

-- Atualizar starts_at para 10/12/2025
UPDATE student_monthly_subscriptions 
SET starts_at = '2025-12-10'::date
WHERE relationship_id = 'a69b061c-b0d6-424f-a3c3-c3dc1c218d73';

-- Criar novas aulas de teste:
-- Aula 1: 09/12/2025 - ANTES starts_at (10/12) - deve ser AVULSA
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, service_id, is_group_class, is_experimental)
VALUES ('11111111-0002-0002-0002-000000000341', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-09 10:00:00+00', 60, 'concluida', '793976f2-7714-49ae-8fb0-d3cc11d98975', false, false);

INSERT INTO class_participants (id, class_id, student_id, status)
VALUES ('22222222-0002-0002-0002-000000000341', '11111111-0002-0002-0002-000000000341', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'concluida');

-- Aula 2: 10/12/2025 - NO DIA starts_at - deve entrar na MENSALIDADE
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, service_id, is_group_class, is_experimental)
VALUES ('11111111-0002-0002-0002-000000000343', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-10 10:00:00+00', 60, 'concluida', '793976f2-7714-49ae-8fb0-d3cc11d98975', false, false);

INSERT INTO class_participants (id, class_id, student_id, status)
VALUES ('22222222-0002-0002-0002-000000000343', '11111111-0002-0002-0002-000000000343', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'concluida');

-- Aula 3: 11/12/2025 - APÓS starts_at - deve entrar na MENSALIDADE
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, service_id, is_group_class, is_experimental)
VALUES ('11111111-0002-0002-0002-000000000342', '51a6b44b-cd23-4b68-b345-ea9806ee5492', '2025-12-11 10:00:00+00', 60, 'concluida', '793976f2-7714-49ae-8fb0-d3cc11d98975', false, false);

INSERT INTO class_participants (id, class_id, student_id, status)
VALUES ('22222222-0002-0002-0002-000000000342', '11111111-0002-0002-0002-000000000342', '07ae0cf4-a46a-42a7-95bd-59b747fed3df', 'concluida');

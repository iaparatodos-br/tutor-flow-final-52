
-- Criar cenário de teste para validar 3.4.1, 3.4.2 e 3.4.3
-- Senhor Erik Jr: student_id = 07ae0cf4-a46a-42a7-95bd-59b747fed3df
-- teacher_id = 51a6b44b-cd23-4b68-b345-ea9806ee5492
-- starts_at = 2025-12-05
-- billing_day = 6

-- Aula 1: ANTES do starts_at (04/12/2025) - Deve ser cobrada por aula
INSERT INTO classes (
  id,
  teacher_id,
  class_date,
  duration_minutes,
  status,
  service_id,
  is_group_class,
  is_experimental
) VALUES (
  '11111111-0001-0001-0001-000000000341',
  '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  '2025-12-04 10:00:00+00',
  60,
  'concluida',
  '793976f2-7714-49ae-8fb0-d3cc11d98975',
  false,
  false
);

INSERT INTO class_participants (
  id,
  class_id,
  student_id,
  status
) VALUES (
  '22222222-0001-0001-0001-000000000341',
  '11111111-0001-0001-0001-000000000341',
  '07ae0cf4-a46a-42a7-95bd-59b747fed3df',
  'concluida'
);

-- Aula 2: NO DIA do starts_at (05/12/2025) - Deve entrar na mensalidade
INSERT INTO classes (
  id,
  teacher_id,
  class_date,
  duration_minutes,
  status,
  service_id,
  is_group_class,
  is_experimental
) VALUES (
  '11111111-0001-0001-0001-000000000343',
  '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  '2025-12-05 10:00:00+00',
  60,
  'concluida',
  '793976f2-7714-49ae-8fb0-d3cc11d98975',
  false,
  false
);

INSERT INTO class_participants (
  id,
  class_id,
  student_id,
  status
) VALUES (
  '22222222-0001-0001-0001-000000000343',
  '11111111-0001-0001-0001-000000000343',
  '07ae0cf4-a46a-42a7-95bd-59b747fed3df',
  'concluida'
);

-- Aula 3: APÓS starts_at (06/12/2025) - Deve entrar na mensalidade
INSERT INTO classes (
  id,
  teacher_id,
  class_date,
  duration_minutes,
  status,
  service_id,
  is_group_class,
  is_experimental
) VALUES (
  '11111111-0001-0001-0001-000000000342',
  '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  '2025-12-06 10:00:00+00',
  60,
  'concluida',
  '793976f2-7714-49ae-8fb0-d3cc11d98975',
  false,
  false
);

INSERT INTO class_participants (
  id,
  class_id,
  student_id,
  status
) VALUES (
  '22222222-0001-0001-0001-000000000342',
  '11111111-0001-0001-0001-000000000342',
  '07ae0cf4-a46a-42a7-95bd-59b747fed3df',
  'concluida'
);

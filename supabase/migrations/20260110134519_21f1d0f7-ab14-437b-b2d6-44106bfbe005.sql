
-- ============================================
-- CRIAR AULAS PARA TESTES 6.5.1 e 6.5.2
-- (Atribuições já foram criadas com sucesso)
-- ============================================

-- Criar 10 aulas concluídas para Erik (Plano Ilimitado)
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, is_experimental, is_template)
SELECT 
  gen_random_uuid(),
  '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  (CURRENT_DATE - 9 + i)::timestamp with time zone + INTERVAL '10 hours',
  60,
  'concluida',
  false,
  false,
  false
FROM generate_series(1, 10) AS i
ON CONFLICT DO NOTHING;

-- Vincular Erik às 10 aulas (status em português)
WITH new_classes AS (
  SELECT id FROM classes 
  WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
  AND status = 'concluida'
  AND class_date >= DATE_TRUNC('month', CURRENT_DATE)
  AND class_date <= CURRENT_DATE + INTERVAL '1 day'
  AND id NOT IN (SELECT class_id FROM class_participants WHERE student_id = 'f12e0f0c-a0d0-4b9a-8023-3672cc5be259')
  ORDER BY class_date
  LIMIT 10
)
INSERT INTO class_participants (id, class_id, student_id, status)
SELECT 
  gen_random_uuid(),
  nc.id,
  'f12e0f0c-a0d0-4b9a-8023-3672cc5be259',  -- Erik
  'concluida'  -- status em português
FROM new_classes nc
ON CONFLICT DO NOTHING;

-- Criar 3 aulas concluídas para Senhor Erik (Plano Dia 31)
-- Datas futuras para não conflitar
INSERT INTO classes (id, teacher_id, class_date, duration_minutes, status, is_group_class, is_experimental, is_template)
SELECT 
  gen_random_uuid(),
  '51a6b44b-cd23-4b68-b345-ea9806ee5492',
  (CURRENT_DATE - 5 + i)::timestamp with time zone + INTERVAL '14 hours',
  60,
  'concluida',
  false,
  false,
  false
FROM generate_series(1, 3) AS i
ON CONFLICT DO NOTHING;

-- Vincular Senhor Erik às 3 aulas
WITH new_classes_sr AS (
  SELECT id FROM classes 
  WHERE teacher_id = '51a6b44b-cd23-4b68-b345-ea9806ee5492'
  AND status = 'concluida'
  AND class_date >= CURRENT_DATE - INTERVAL '5 days'
  AND id NOT IN (SELECT class_id FROM class_participants WHERE student_id = '708487cd-0aa9-4bc4-8192-3ba36e3649c3')
  ORDER BY class_date DESC
  LIMIT 3
)
INSERT INTO class_participants (id, class_id, student_id, status)
SELECT 
  gen_random_uuid(),
  nc.id,
  '708487cd-0aa9-4bc4-8192-3ba36e3649c3',  -- Senhor Erik
  'concluida'
FROM new_classes_sr nc
ON CONFLICT DO NOTHING;

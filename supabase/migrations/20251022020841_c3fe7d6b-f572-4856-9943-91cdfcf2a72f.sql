-- ✅ OTIMIZAÇÃO FASE 5: Índices para performance do calendário

-- Índice composto para busca de aulas materializadas por professor e data
-- Usado em: get_classes_with_participants RPC e query de alunos
CREATE INDEX IF NOT EXISTS idx_classes_teacher_date_materialized 
ON classes(teacher_id, class_date)
WHERE is_template IS NOT TRUE;

-- Índice para busca de templates ativas por professor
-- Usado em: get_classes_with_participants RPC para gerar instâncias virtuais
CREATE INDEX IF NOT EXISTS idx_classes_teacher_templates 
ON classes(teacher_id, recurrence_end_date)
WHERE is_template IS TRUE;

-- Índice composto para lookup eficiente de participantes
-- Usado em: Join de participantes em todas queries de aulas
CREATE INDEX IF NOT EXISTS idx_class_participants_class_student 
ON class_participants(class_id, student_id, status);

-- Índice para lookup de aulas materializadas por template (para filtrar virtuais)
-- Usado em: Lógica de geração de virtuais para evitar conflitos
CREATE INDEX IF NOT EXISTS idx_classes_template_id 
ON classes(class_template_id, class_date)
WHERE class_template_id IS NOT NULL;

-- Índice para blocos de disponibilidade por professor e período
-- Usado em: Query de blocos de disponibilidade do calendário
CREATE INDEX IF NOT EXISTS idx_availability_blocks_teacher_date
ON availability_blocks(teacher_id, start_datetime, end_datetime);

-- Comentários para documentação
COMMENT ON INDEX idx_classes_teacher_date_materialized IS 'Otimiza busca de aulas materializadas por professor e data no calendário';
COMMENT ON INDEX idx_classes_teacher_templates IS 'Otimiza busca de templates para geração de instâncias virtuais';
COMMENT ON INDEX idx_class_participants_class_student IS 'Otimiza join de participantes em queries de aulas';
COMMENT ON INDEX idx_classes_template_id IS 'Otimiza lookup de materializadas para filtrar conflitos com virtuais';
COMMENT ON INDEX idx_availability_blocks_teacher_date IS 'Otimiza busca de blocos de disponibilidade no calendário';
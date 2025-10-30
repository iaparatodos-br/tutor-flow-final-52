-- FASE 5: Migração Final - Remover campos billed das tabelas

-- 1. Remover campo billed de class_participants
ALTER TABLE public.class_participants 
DROP COLUMN IF EXISTS billed;

-- 2. Remover campo billed de classes
ALTER TABLE public.classes 
DROP COLUMN IF EXISTS billed;

-- 3. Criar índices para otimizar queries de faturamento
CREATE INDEX IF NOT EXISTS idx_invoice_classes_participant_lookup 
ON public.invoice_classes(participant_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_classes_class_lookup 
ON public.invoice_classes(class_id, invoice_id);

-- 4. Adicionar comentários para documentação
COMMENT ON TABLE public.invoice_classes IS 
'Tabela de relacionamento entre faturas e aulas/participantes. Fonte única da verdade para determinar se uma aula foi faturada.';

COMMENT ON COLUMN public.invoice_classes.participant_id IS 
'ID do participante faturado. Use LEFT JOIN para verificar se um participante foi faturado.';
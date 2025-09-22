-- Corrigir erro de conversão do enum - migração em etapas

-- 1. Criar enum para status de processamento
CREATE TYPE processing_status_enum AS ENUM ('processing', 'completed', 'failed', 'timeout');

-- 2. Adicionar coluna de status sem default primeiro
ALTER TABLE public.processed_stripe_events 
ADD COLUMN processing_status_new processing_status_enum;

-- 3. Atualizar eventos existentes para 'completed' (assumindo que já foram processados)
UPDATE public.processed_stripe_events 
SET processing_status_new = 'completed';

-- 4. Tornar a nova coluna NOT NULL e adicionar default
ALTER TABLE public.processed_stripe_events 
ALTER COLUMN processing_status_new SET NOT NULL,
ALTER COLUMN processing_status_new SET DEFAULT 'completed';

-- 5. Remover coluna antiga e renomear a nova
ALTER TABLE public.processed_stripe_events 
DROP COLUMN processing_status,
RENAME COLUMN processing_status_new TO processing_status;

-- 6. Adicionar colunas de controle de tempo
ALTER TABLE public.processed_stripe_events 
ADD COLUMN processing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN processing_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN retry_count INTEGER DEFAULT 0,
ADD COLUMN last_error TEXT;

-- 7. Atualizar eventos existentes com timestamps
UPDATE public.processed_stripe_events 
SET 
    processing_started_at = processed_at,
    processing_completed_at = processed_at
WHERE processing_started_at IS NULL;
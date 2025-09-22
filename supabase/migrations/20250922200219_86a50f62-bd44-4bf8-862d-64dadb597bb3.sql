-- Corrigir sintaxe SQL - migração corrigida

-- 1. Criar enum para status de processamento  
CREATE TYPE processing_status_enum AS ENUM ('processing', 'completed', 'failed', 'timeout');

-- 2. Adicionar coluna de status temporária
ALTER TABLE public.processed_stripe_events 
ADD COLUMN processing_status_temp processing_status_enum DEFAULT 'completed';

-- 3. Atualizar todos os registros existentes
UPDATE public.processed_stripe_events 
SET processing_status_temp = 'completed';

-- 4. Remover coluna antiga
ALTER TABLE public.processed_stripe_events 
DROP COLUMN processing_status;
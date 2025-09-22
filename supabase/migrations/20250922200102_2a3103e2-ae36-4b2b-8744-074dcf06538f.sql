-- Corrigir arquitetura de idempotência com estado de processamento e rollback automático

-- 1. Adicionar coluna de status de processamento
ALTER TABLE public.processed_stripe_events 
ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'completed';

-- 2. Criar enum para status de processamento
CREATE TYPE processing_status_enum AS ENUM ('processing', 'completed', 'failed', 'timeout');

ALTER TABLE public.processed_stripe_events 
ALTER COLUMN processing_status TYPE processing_status_enum 
USING processing_status::processing_status_enum;

-- 3. Adicionar colunas de controle de tempo
ALTER TABLE public.processed_stripe_events 
ADD COLUMN processing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN processing_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN retry_count INTEGER DEFAULT 0,
ADD COLUMN last_error TEXT;

-- 4. Função melhorada com estado de processamento
CREATE OR REPLACE FUNCTION public.start_stripe_event_processing(
    p_event_id TEXT,
    p_event_type TEXT,
    p_webhook_function TEXT,
    p_event_created TIMESTAMP WITH TIME ZONE,
    p_event_data JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_fingerprint TEXT;
    v_existing_event RECORD;
    v_result JSONB := '{"status": "success", "action": "started", "message": ""}'::jsonb;
    v_timeout_threshold TIMESTAMP WITH TIME ZONE := NOW() - INTERVAL '5 minutes';
BEGIN
    -- Gerar fingerprint do evento
    v_fingerprint := public.generate_stripe_fingerprint(p_event_data);
    
    -- Verificar se evento já foi processado ou está em processamento
    SELECT * INTO v_existing_event 
    FROM public.processed_stripe_events 
    WHERE event_id = p_event_id;
    
    IF FOUND THEN
        -- Verificar status do evento existente
        CASE v_existing_event.processing_status
            WHEN 'completed' THEN
                -- Verificar se dados mudaram
                IF v_existing_event.data_fingerprint = v_fingerprint THEN
                    v_result := jsonb_set(v_result, '{action}', '"skipped"');
                    v_result := jsonb_set(v_result, '{message}', '"Event already completed with identical data"');
                    RETURN v_result;
                ELSE
                    -- Dados diferentes, verificar se evento é mais recente
                    IF p_event_created <= v_existing_event.event_created THEN
                        v_result := jsonb_set(v_result, '{action}', '"skipped"');
                        v_result := jsonb_set(v_result, '{message}', '"Older or equal event ignored"');
                        RETURN v_result;
                    END IF;
                END IF;
                
            WHEN 'processing' THEN
                -- Verificar se não está em timeout
                IF v_existing_event.processing_started_at < v_timeout_threshold THEN
                    -- Timeout detectado, marcar como failed e permitir reprocessamento
                    UPDATE public.processed_stripe_events 
                    SET processing_status = 'timeout',
                        last_error = 'Processing timeout after 5 minutes'
                    WHERE event_id = p_event_id;
                    
                    v_result := jsonb_set(v_result, '{action}', '"timeout_retry"');
                    v_result := jsonb_set(v_result, '{message}', '"Previous processing timed out, retrying"');
                ELSE
                    -- Ainda em processamento, rejeitar
                    v_result := jsonb_set(v_result, '{status}', '"error"');
                    v_result := jsonb_set(v_result, '{action}', '"rejected"');
                    v_result := jsonb_set(v_result, '{message}', '"Event currently being processed"');
                    RETURN v_result;
                END IF;
                
            WHEN 'failed' THEN
                -- Permitir retry após incrementar contador
                IF v_existing_event.retry_count >= 3 THEN
                    v_result := jsonb_set(v_result, '{status}', '"error"');
                    v_result := jsonb_set(v_result, '{action}', '"max_retries"');
                    v_result := jsonb_set(v_result, '{message}', '"Maximum retry attempts exceeded"');
                    RETURN v_result;
                END IF;
                
            WHEN 'timeout' THEN
                -- Permitir retry após timeout
                NULL;
        END CASE;
        
        -- Atualizar evento existente para iniciar novo processamento
        UPDATE public.processed_stripe_events 
        SET 
            processing_status = 'processing',
            processing_started_at = NOW(),
            processing_completed_at = NULL,
            event_created = p_event_created,
            data_fingerprint = v_fingerprint,
            event_data = p_event_data,
            retry_count = CASE 
                WHEN v_existing_event.processing_status IN ('failed', 'timeout') 
                THEN v_existing_event.retry_count + 1 
                ELSE 0 
            END,
            last_error = NULL
        WHERE event_id = p_event_id;
        
        v_result := jsonb_set(v_result, '{action}', '"retry"');
        v_result := jsonb_set(v_result, '{message}', '"Event restarted for processing"');
        
    ELSE
        -- Novo evento, inserir com status de processamento
        INSERT INTO public.processed_stripe_events (
            event_id,
            event_type,
            webhook_function,
            event_created,
            data_fingerprint,
            event_data,
            processing_status,
            processing_started_at,
            retry_count
        ) VALUES (
            p_event_id,
            p_event_type,
            p_webhook_function,
            p_event_created,
            v_fingerprint,
            p_event_data,
            'processing',
            NOW(),
            0
        );
        
        v_result := jsonb_set(v_result, '{action}', '"new"');
        v_result := jsonb_set(v_result, '{message}', '"New event started processing"');
    END IF;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Função para marcar evento como completado
CREATE OR REPLACE FUNCTION public.complete_stripe_event_processing(
    p_event_id TEXT,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_success THEN
        UPDATE public.processed_stripe_events 
        SET 
            processing_status = 'completed',
            processing_completed_at = NOW(),
            processing_result = '{"status": "success"}'::jsonb,
            last_error = NULL
        WHERE event_id = p_event_id;
    ELSE
        UPDATE public.processed_stripe_events 
        SET 
            processing_status = 'failed',
            processing_completed_at = NOW(),
            processing_result = jsonb_build_object('status', 'error', 'error', p_error_message),
            last_error = p_error_message
        WHERE event_id = p_event_id;
    END IF;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Função para cleanup de eventos órfãos (timeout)
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_stripe_events()
RETURNS INTEGER AS $$
DECLARE
    v_cleaned_count INTEGER := 0;
BEGIN
    -- Marcar eventos órfãos como timeout
    UPDATE public.processed_stripe_events 
    SET 
        processing_status = 'timeout',
        last_error = 'Processing timeout - marked as orphaned'
    WHERE 
        processing_status = 'processing' 
        AND processing_started_at < NOW() - INTERVAL '10 minutes';
    
    GET DIAGNOSTICS v_cleaned_count = ROW_COUNT;
    
    RETURN v_cleaned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Agendar cleanup de eventos órfãos (a cada 15 minutos)
SELECT cron.schedule(
    'cleanup-orphaned-stripe-events',
    '*/15 * * * *',
    'SELECT public.cleanup_orphaned_stripe_events();'
);

-- 8. Índices adicionais para performance com novos campos
CREATE INDEX idx_processed_events_status ON public.processed_stripe_events(processing_status, processing_started_at);
CREATE INDEX idx_processed_events_retry ON public.processed_stripe_events(retry_count) WHERE processing_status = 'failed';
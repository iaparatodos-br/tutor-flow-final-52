-- Corrigir problemas de segurança detectados pelo linter

-- 1. Adicionar search_path às funções para resolver avisos de segurança
CREATE OR REPLACE FUNCTION public.generate_stripe_fingerprint(event_data JSONB)
RETURNS TEXT AS $$
BEGIN
    RETURN MD5(event_data::TEXT);
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.process_stripe_event_atomic(
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
    v_result JSONB := '{"status": "success", "action": "processed", "message": ""}'::jsonb;
BEGIN
    -- Gerar fingerprint do evento
    v_fingerprint := public.generate_stripe_fingerprint(p_event_data);
    
    -- Verificar se evento já foi processado
    SELECT * INTO v_existing_event 
    FROM public.processed_stripe_events 
    WHERE event_id = p_event_id;
    
    IF FOUND THEN
        -- Verificar se os dados mudaram
        IF v_existing_event.data_fingerprint = v_fingerprint THEN
            -- Evento idêntico já processado
            v_result := jsonb_set(v_result, '{action}', '"skipped"');
            v_result := jsonb_set(v_result, '{message}', '"Event already processed with identical data"');
            RETURN v_result;
        ELSE
            -- Dados diferentes, verificar timestamp
            IF p_event_created <= v_existing_event.event_created THEN
                -- Evento mais antigo, ignorar
                v_result := jsonb_set(v_result, '{action}', '"skipped"');
                v_result := jsonb_set(v_result, '{message}', '"Older or equal event ignored"');
                RETURN v_result;
            ELSE
                -- Evento mais recente, atualizar registro
                UPDATE public.processed_stripe_events 
                SET 
                    event_created = p_event_created,
                    data_fingerprint = v_fingerprint,
                    processing_result = v_result,
                    event_data = p_event_data,
                    processed_at = NOW()
                WHERE event_id = p_event_id;
                
                v_result := jsonb_set(v_result, '{action}', '"updated"');
                v_result := jsonb_set(v_result, '{message}', '"Event updated with newer data"');
                RETURN v_result;
            END IF;
        END IF;
    ELSE
        -- Novo evento, inserir registro
        INSERT INTO public.processed_stripe_events (
            event_id,
            event_type,
            webhook_function,
            event_created,
            data_fingerprint,
            processing_result,
            event_data
        ) VALUES (
            p_event_id,
            p_event_type,
            p_webhook_function,
            p_event_created,
            v_fingerprint,
            v_result,
            p_event_data
        );
        
        v_result := jsonb_set(v_result, '{action}', '"new"');
        v_result := jsonb_set(v_result, '{message}', '"New event processed successfully"');
        RETURN v_result;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.archive_old_stripe_events()
RETURNS INTEGER AS $$
DECLARE
    v_archived_count INTEGER := 0;
BEGIN
    -- Mover eventos antigos para tabela de arquivo
    WITH archived_events AS (
        DELETE FROM public.processed_stripe_events 
        WHERE processed_at < NOW() - INTERVAL '90 days'
        RETURNING *
    )
    INSERT INTO public.archived_stripe_events (
        event_id, event_type, webhook_function, processed_at,
        event_created, data_fingerprint, processing_result, event_data
    )
    SELECT 
        event_id, event_type, webhook_function, processed_at,
        event_created, data_fingerprint, processing_result, event_data
    FROM archived_events;
    
    GET DIAGNOSTICS v_archived_count = ROW_COUNT;
    
    RETURN v_archived_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Habilitar RLS nas novas tabelas (crítico para segurança)
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_stripe_events ENABLE ROW LEVEL SECURITY;

-- 3. Criar políticas RLS restritivas (apenas system/admin access)
CREATE POLICY "System can manage processed stripe events" 
ON public.processed_stripe_events 
FOR ALL 
USING (false) 
WITH CHECK (false);

CREATE POLICY "System can manage archived stripe events" 
ON public.archived_stripe_events 
FOR ALL 
USING (false) 
WITH CHECK (false);

-- Comentário: As políticas são intencionalmente restritivas pois essas tabelas
-- devem ser acessadas apenas por Edge Functions com service role key,
-- nunca diretamente por usuários finais
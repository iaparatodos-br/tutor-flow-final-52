-- =====================================================
-- MIGRAÇÃO: Centralizar Status em class_participants
-- =====================================================

-- FASE 0: Adicionar coluna updated_at primeiro (para o trigger existente)
ALTER TABLE public.class_participants 
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW();

-- FASE 1: Adicionar colunas de status em class_participants
ALTER TABLE public.class_participants 
ADD COLUMN status text NOT NULL DEFAULT 'pendente',
ADD COLUMN cancelled_at timestamptz,
ADD COLUMN cancelled_by uuid REFERENCES profiles(id),
ADD COLUMN charge_applied boolean DEFAULT false,
ADD COLUMN cancellation_reason text,
ADD COLUMN confirmed_at timestamptz,
ADD COLUMN completed_at timestamptz,
ADD COLUMN billed boolean DEFAULT false;

-- Constraint para validar status
ALTER TABLE public.class_participants
ADD CONSTRAINT class_participants_status_check 
CHECK (status IN ('pendente', 'confirmada', 'cancelada', 'concluida', 'removida'));

-- Índices para performance
CREATE INDEX idx_class_participants_status ON public.class_participants(class_id, status);
CREATE INDEX idx_class_participants_student_status ON public.class_participants(student_id, status);
CREATE INDEX idx_class_participants_billed ON public.class_participants(student_id, billed) WHERE billed = false;

-- FASE 2: Migrar dados existentes

-- 2.1. Criar participantes para aulas individuais que ainda não existem
INSERT INTO public.class_participants (class_id, student_id, status, confirmed_at, completed_at, cancelled_at, cancelled_by, charge_applied, cancellation_reason, billed, updated_at)
SELECT 
  c.id as class_id,
  c.student_id,
  c.status,
  CASE WHEN c.status = 'confirmada' THEN c.updated_at END,
  CASE WHEN c.status = 'concluida' THEN c.updated_at END,
  c.cancelled_at,
  c.cancelled_by,
  c.charge_applied,
  c.cancellation_reason,
  c.billed,
  c.updated_at
FROM public.classes c
WHERE c.student_id IS NOT NULL
  AND c.is_group_class = false
  AND NOT EXISTS (
    SELECT 1 FROM public.class_participants cp 
    WHERE cp.class_id = c.id AND cp.student_id = c.student_id
  );

-- 2.2. Atualizar status dos participantes existentes baseado no status da classe
UPDATE public.class_participants cp
SET 
  status = c.status,
  confirmed_at = CASE WHEN c.status = 'confirmada' THEN c.updated_at END,
  completed_at = CASE WHEN c.status = 'concluida' THEN c.updated_at END,
  cancelled_at = CASE WHEN c.status = 'cancelada' THEN c.cancelled_at END,
  cancelled_by = CASE WHEN c.status = 'cancelada' THEN c.cancelled_by END,
  charge_applied = CASE WHEN c.status = 'cancelada' THEN c.charge_applied ELSE false END,
  cancellation_reason = CASE WHEN c.status = 'cancelada' THEN c.cancellation_reason END,
  billed = c.billed,
  updated_at = c.updated_at
FROM public.classes c
WHERE cp.class_id = c.id;

-- FASE 3: Criar função para sincronizar status da classe

CREATE OR REPLACE FUNCTION public.sync_class_status_from_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_all_cancelled boolean;
  v_any_concluida boolean;
  v_any_confirmada boolean;
  v_class_status text;
BEGIN
  -- Verificar status de todos os participantes da aula
  SELECT 
    COALESCE(BOOL_AND(status IN ('cancelada', 'removida')), false) as all_cancelled,
    COALESCE(BOOL_OR(status = 'concluida'), false) as any_concluida,
    COALESCE(BOOL_OR(status = 'confirmada'), false) as any_confirmada
  INTO v_all_cancelled, v_any_concluida, v_any_confirmada
  FROM public.class_participants
  WHERE class_id = COALESCE(NEW.class_id, OLD.class_id);
  
  -- Determinar status da classe baseado nos participantes
  IF v_all_cancelled THEN
    v_class_status := 'cancelada';
  ELSIF v_any_concluida THEN
    v_class_status := 'concluida';
  ELSIF v_any_confirmada THEN
    v_class_status := 'confirmada';
  ELSE
    v_class_status := 'pendente';
  END IF;
  
  -- Atualizar classe (apenas para visualização/agregação)
  UPDATE public.classes
  SET 
    status = v_class_status,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.class_id, OLD.class_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Criar trigger para sincronizar status
CREATE TRIGGER trg_sync_class_status_after_participant_change
AFTER INSERT OR UPDATE OR DELETE ON public.class_participants
FOR EACH ROW
EXECUTE FUNCTION public.sync_class_status_from_participants();

-- FASE 4: Comentários para documentação

COMMENT ON COLUMN public.class_participants.status IS 'Status individual: pendente, confirmada, cancelada, concluida, removida';
COMMENT ON COLUMN public.class_participants.cancelled_at IS 'Timestamp do cancelamento';
COMMENT ON COLUMN public.class_participants.cancelled_by IS 'Usuário que cancelou (professor ou aluno)';
COMMENT ON COLUMN public.class_participants.charge_applied IS 'Se cobrança foi aplicada no cancelamento';
COMMENT ON COLUMN public.class_participants.cancellation_reason IS 'Motivo do cancelamento';
COMMENT ON COLUMN public.class_participants.confirmed_at IS 'Timestamp da confirmação da aula';
COMMENT ON COLUMN public.class_participants.completed_at IS 'Timestamp da conclusão da aula';
COMMENT ON COLUMN public.class_participants.billed IS 'Se já foi faturado';
COMMENT ON COLUMN public.classes.status IS '[DEPRECATED] Status agregado calculado automaticamente. Use class_participants.status para consultas';
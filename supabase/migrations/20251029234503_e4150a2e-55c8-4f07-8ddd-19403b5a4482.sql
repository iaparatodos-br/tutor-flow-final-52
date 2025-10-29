-- Criar tabela invoice_classes para rastreabilidade completa entre faturas e aulas
CREATE TABLE public.invoice_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relacionamentos
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.class_participants(id) ON DELETE CASCADE,
  
  -- Metadados do item
  item_type TEXT NOT NULL CHECK (item_type IN ('completed_class', 'cancellation_charge')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  
  -- Dados específicos de cancelamento (quando aplicável)
  cancellation_policy_id UUID REFERENCES public.cancellation_policies(id),
  charge_percentage NUMERIC(5, 2) CHECK (charge_percentage >= 0 AND charge_percentage <= 100),
  
  -- Auditoria
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT invoice_classes_unique_participant UNIQUE (invoice_id, participant_id),
  CONSTRAINT invoice_classes_cancellation_check CHECK (
    (item_type = 'cancellation_charge' AND cancellation_policy_id IS NOT NULL) OR
    (item_type = 'completed_class' AND cancellation_policy_id IS NULL)
  )
);

-- Índices para performance
CREATE INDEX idx_invoice_classes_invoice_id ON public.invoice_classes(invoice_id);
CREATE INDEX idx_invoice_classes_class_id ON public.invoice_classes(class_id);
CREATE INDEX idx_invoice_classes_participant_id ON public.invoice_classes(participant_id);
CREATE INDEX idx_invoice_classes_item_type ON public.invoice_classes(item_type);

-- Habilitar RLS
ALTER TABLE public.invoice_classes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Professores podem ver itens de suas próprias faturas
CREATE POLICY "Teachers can view their invoice items"
  ON public.invoice_classes FOR SELECT
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices WHERE teacher_id = auth.uid()
    )
  );

-- Alunos podem ver itens de suas próprias faturas
CREATE POLICY "Students can view their invoice items"
  ON public.invoice_classes FOR SELECT
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices WHERE student_id = auth.uid()
    )
  );

-- Service role pode gerenciar tudo (para Edge Functions)
CREATE POLICY "Service role can manage invoice items"
  ON public.invoice_classes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Atualizar função RPC para suportar invoice_classes
CREATE OR REPLACE FUNCTION public.create_invoice_and_mark_classes_billed(
  p_invoice_data jsonb,
  p_class_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_id uuid;
  v_result jsonb;
  v_item jsonb;
  v_class_ids uuid[];
  v_participant_ids uuid[];
BEGIN
  -- 1. Criar a fatura
  INSERT INTO public.invoices (
    student_id,
    teacher_id,
    amount,
    description,
    due_date,
    status,
    invoice_type,
    business_profile_id,
    created_at,
    updated_at
  ) VALUES (
    (p_invoice_data->>'student_id')::uuid,
    (p_invoice_data->>'teacher_id')::uuid,
    (p_invoice_data->>'amount')::numeric,
    p_invoice_data->>'description',
    (p_invoice_data->>'due_date')::date,
    p_invoice_data->>'status',
    p_invoice_data->>'invoice_type',
    (p_invoice_data->>'business_profile_id')::uuid,
    NOW(),
    NOW()
  ) RETURNING id INTO v_invoice_id;
  
  -- 2. Criar registros em invoice_classes para cada item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_class_items)
  LOOP
    INSERT INTO public.invoice_classes (
      invoice_id,
      class_id,
      participant_id,
      item_type,
      amount,
      description,
      cancellation_policy_id,
      charge_percentage
    ) VALUES (
      v_invoice_id,
      (v_item->>'class_id')::uuid,
      (v_item->>'participant_id')::uuid,
      v_item->>'item_type',
      (v_item->>'amount')::numeric,
      v_item->>'description',
      (v_item->>'cancellation_policy_id')::uuid,
      (v_item->>'charge_percentage')::numeric
    );
    
    -- Coletar IDs para atualização em lote
    v_class_ids := array_append(v_class_ids, (v_item->>'class_id')::uuid);
    v_participant_ids := array_append(v_participant_ids, (v_item->>'participant_id')::uuid);
  END LOOP;
  
  -- 3. Marcar classes como faturadas (em lote)
  UPDATE public.classes 
  SET 
    billed = true,
    updated_at = NOW()
  WHERE id = ANY(v_class_ids);
  
  -- 4. Marcar participantes como faturados (em lote)
  UPDATE public.class_participants
  SET billed = true
  WHERE id = ANY(v_participant_ids);
  
  -- 5. Retornar resultado
  v_result := jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'items_created', jsonb_array_length(p_class_items),
    'classes_updated', array_length(v_class_ids, 1),
    'participants_updated', array_length(v_participant_ids, 1)
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$$;
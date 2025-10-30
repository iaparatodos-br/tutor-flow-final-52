-- Recriar função RPC removendo completamente referências ao campo billed
DROP FUNCTION IF EXISTS public.create_invoice_and_mark_classes_billed(jsonb, jsonb);

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
    
    -- Coletar IDs para resultado
    v_class_ids := array_append(v_class_ids, (v_item->>'class_id')::uuid);
    v_participant_ids := array_append(v_participant_ids, (v_item->>'participant_id')::uuid);
  END LOOP;
  
  -- 3. Retornar resultado (SEM atualizar campos billed inexistentes)
  v_result := jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'items_created', jsonb_array_length(p_class_items),
    'classes_affected', array_length(v_class_ids, 1),
    'participants_affected', array_length(v_participant_ids, 1)
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

COMMENT ON FUNCTION public.create_invoice_and_mark_classes_billed IS
'Cria fatura e registra itens em invoice_classes. Não usa mais campos billed.';
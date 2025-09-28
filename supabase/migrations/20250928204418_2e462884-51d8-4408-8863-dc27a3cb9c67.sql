-- Criar função para faturamento automático com transação atômica
CREATE OR REPLACE FUNCTION public.create_invoice_and_mark_classes_billed(
  p_invoice_data jsonb,
  p_class_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_id uuid;
  v_result jsonb;
BEGIN
  -- Iniciar transação implícita (função já executa em transação)
  
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
  
  -- 2. Marcar classes como faturadas
  UPDATE public.classes 
  SET 
    billed = true,
    updated_at = NOW()
  WHERE id = ANY(p_class_ids);
  
  -- 3. Retornar resultado
  v_result := jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'classes_updated', array_length(p_class_ids, 1)
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Em caso de erro, a transação será automaticamente revertida
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_class_status_from_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_all_cancelled boolean;
  v_any_active boolean;
  v_any_concluida boolean;
  v_any_confirmada boolean;
  v_any_aguardando_pagamento boolean;
  v_class_status text;
  v_is_group_class boolean;
BEGIN
  SELECT is_group_class INTO v_is_group_class
  FROM public.classes
  WHERE id = COALESCE(NEW.class_id, OLD.class_id);

  SELECT
    COALESCE(BOOL_AND(status IN ('cancelada', 'removida')), false),
    COALESCE(BOOL_OR(status NOT IN ('cancelada', 'removida')), false),
    COALESCE(BOOL_OR(status = 'concluida'), false),
    COALESCE(BOOL_OR(status = 'confirmada'), false),
    COALESCE(BOOL_OR(status = 'aguardando_pagamento'), false)
  INTO v_all_cancelled, v_any_active, v_any_concluida, v_any_confirmada, v_any_aguardando_pagamento
  FROM public.class_participants
  WHERE class_id = COALESCE(NEW.class_id, OLD.class_id);

  IF v_all_cancelled THEN
    v_class_status := 'cancelada';
  ELSIF v_is_group_class AND v_any_active THEN
    RETURN COALESCE(NEW, OLD);
  ELSIF v_any_concluida THEN
    v_class_status := 'concluida';
  ELSIF v_any_confirmada THEN
    v_class_status := 'confirmada';
  ELSIF v_any_aguardando_pagamento THEN
    v_class_status := 'aguardando_pagamento';
  ELSE
    v_class_status := 'pendente';
  END IF;

  UPDATE public.classes
  SET status = v_class_status, updated_at = NOW()
  WHERE id = COALESCE(NEW.class_id, OLD.class_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;
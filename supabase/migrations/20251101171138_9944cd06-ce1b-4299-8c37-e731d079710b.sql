-- Fix sync_class_status_from_participants trigger to handle partial cancellations in group classes
-- This ensures group classes maintain their status until ALL participants cancel

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
  v_class_status text;
  v_is_group_class boolean;
BEGIN
  -- Check if it's a group class
  SELECT is_group_class INTO v_is_group_class
  FROM public.classes
  WHERE id = COALESCE(NEW.class_id, OLD.class_id);
  
  -- Check status of all participants
  SELECT 
    COALESCE(BOOL_AND(status IN ('cancelada', 'removida')), false) as all_cancelled,
    COALESCE(BOOL_OR(status NOT IN ('cancelada', 'removida')), false) as any_active,
    COALESCE(BOOL_OR(status = 'concluida'), false) as any_concluida,
    COALESCE(BOOL_OR(status = 'confirmada'), false) as any_confirmada
  INTO v_all_cancelled, v_any_active, v_any_concluida, v_any_confirmada
  FROM public.class_participants
  WHERE class_id = COALESCE(NEW.class_id, OLD.class_id);
  
  -- ===== INTELLIGENT STATUS LOGIC =====
  
  -- If ALL participants cancelled → cancel class
  IF v_all_cancelled THEN
    v_class_status := 'cancelada';
  
  -- If it's a group class AND there are still active participants → keep original status
  ELSIF v_is_group_class AND v_any_active THEN
    -- DO NOT update status, just return
    RETURN COALESCE(NEW, OLD);
  
  -- Traditional logic for individual classes
  ELSIF v_any_concluida THEN
    v_class_status := 'concluida';
  ELSIF v_any_confirmada THEN
    v_class_status := 'confirmada';
  ELSE
    v_class_status := 'pendente';
  END IF;
  
  -- Update class
  UPDATE public.classes
  SET 
    status = v_class_status,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.class_id, OLD.class_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;
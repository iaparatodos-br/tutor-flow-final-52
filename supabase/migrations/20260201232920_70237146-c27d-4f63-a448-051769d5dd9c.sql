-- =====================================================
-- TEACHER INBOX - BLOCO 1: FUNDAÇÃO BACKEND (PARTE 2)
-- Tarefas 1.4 a 1.8 - Corrigidas
-- =====================================================

-- =====================================================
-- TAREFA 1.4: RPC get_teacher_notification_counts
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_teacher_notification_counts()
RETURNS TABLE (
  inbox_count BIGINT,
  inbox_unread_count BIGINT,
  saved_count BIGINT,
  done_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID := auth.uid();
BEGIN
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE tn.status = 'inbox') as inbox_count,
    COUNT(*) FILTER (WHERE tn.status = 'inbox' AND tn.is_read = false) as inbox_unread_count,
    COUNT(*) FILTER (WHERE tn.status = 'saved') as saved_count,
    COUNT(*) FILTER (WHERE tn.status = 'done') as done_count
  FROM public.teacher_notifications tn
  WHERE tn.teacher_id = v_teacher_id;
END;
$$;

-- =====================================================
-- TAREFA 1.5: RPC get_teacher_notifications
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_teacher_notifications(
  p_status TEXT DEFAULT 'inbox',
  p_is_read BOOLEAN DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  teacher_id UUID,
  source_type TEXT,
  source_id UUID,
  category TEXT,
  status TEXT,
  is_read BOOLEAN,
  created_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  status_changed_at TIMESTAMPTZ,
  class_date TIMESTAMPTZ,
  class_status TEXT,
  student_name TEXT,
  student_email TEXT,
  invoice_amount NUMERIC,
  invoice_due_date DATE,
  invoice_status TEXT,
  service_name TEXT,
  days_overdue INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID := auth.uid();
BEGIN
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    tn.id,
    tn.teacher_id,
    tn.source_type,
    tn.source_id,
    tn.category,
    tn.status,
    tn.is_read,
    tn.created_at,
    tn.read_at,
    tn.status_changed_at,
    c.class_date,
    c.status as class_status,
    COALESCE(
      CASE 
        WHEN tn.source_type = 'class' THEN (
          SELECT COALESCE(d.name, p.name, 'Aluno não identificado')
          FROM class_participants cp
          LEFT JOIN profiles p ON cp.student_id = p.id
          LEFT JOIN dependents d ON cp.dependent_id = d.id
          WHERE cp.class_id = tn.source_id
          LIMIT 1
        )
        WHEN tn.source_type = 'invoice' THEN (
          SELECT COALESCE(p.name, 'Aluno não identificado')
          FROM profiles p
          WHERE p.id = i.student_id
        )
      END,
      'Aluno não identificado'
    ) as student_name,
    CASE 
      WHEN tn.source_type = 'class' THEN (
        SELECT p.email
        FROM class_participants cp
        LEFT JOIN profiles p ON cp.student_id = p.id
        WHERE cp.class_id = tn.source_id
        LIMIT 1
      )
      WHEN tn.source_type = 'invoice' THEN (
        SELECT p.email FROM profiles p WHERE p.id = i.student_id
      )
    END as student_email,
    i.amount as invoice_amount,
    i.due_date as invoice_due_date,
    i.status as invoice_status,
    cs.name as service_name,
    CASE 
      WHEN tn.source_type = 'invoice' AND i.due_date IS NOT NULL THEN
        GREATEST(0, (CURRENT_DATE - i.due_date))
      WHEN tn.source_type = 'class' AND c.class_date IS NOT NULL THEN
        GREATEST(0, EXTRACT(DAY FROM (NOW() - c.class_date))::INTEGER)
      ELSE 0
    END as days_overdue
  FROM public.teacher_notifications tn
  LEFT JOIN public.classes c ON tn.source_type = 'class' AND tn.source_id = c.id
  LEFT JOIN public.invoices i ON tn.source_type = 'invoice' AND tn.source_id = i.id
  LEFT JOIN public.class_services cs ON c.service_id = cs.id
  WHERE tn.teacher_id = v_teacher_id
    AND tn.status = p_status
    AND (p_is_read IS NULL OR tn.is_read = p_is_read)
    AND (p_category IS NULL OR tn.category = p_category)
    AND (tn.source_type != 'class' OR (c.is_experimental = false AND c.is_template = false))
  ORDER BY tn.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- =====================================================
-- TAREFA 1.6: RPC update_notification_status
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_notification_status(
  p_notification_id UUID,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID := auth.uid();
  v_rows_affected INTEGER;
BEGIN
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_new_status NOT IN ('inbox', 'saved', 'done') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  UPDATE public.teacher_notifications
  SET 
    status = p_new_status,
    status_changed_at = NOW()
  WHERE id = p_notification_id
    AND teacher_id = v_teacher_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  
  RETURN v_rows_affected > 0;
END;
$$;

-- =====================================================
-- TAREFA 1.7: RPC mark_notification_read
-- =====================================================
CREATE OR REPLACE FUNCTION public.mark_notification_read(
  p_notification_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID := auth.uid();
  v_rows_affected INTEGER;
BEGIN
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.teacher_notifications
  SET 
    is_read = true,
    read_at = NOW()
  WHERE id = p_notification_id
    AND teacher_id = v_teacher_id
    AND is_read = false;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  
  RETURN v_rows_affected > 0;
END;
$$;

-- =====================================================
-- TAREFA 1.8: Triggers de Auto-Remoção
-- =====================================================

-- Trigger function: Remove notification when class is resolved
CREATE OR REPLACE FUNCTION public.trg_remove_class_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('confirmada', 'concluida', 'cancelada') AND 
     (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    DELETE FROM public.teacher_notifications
    WHERE source_type = 'class'
      AND source_id = NEW.id
      AND category IN ('pending_past_classes', 'amnesty_eligible');
  END IF;

  IF NEW.amnesty_granted = true AND (OLD.amnesty_granted IS NULL OR OLD.amnesty_granted = false) THEN
    DELETE FROM public.teacher_notifications
    WHERE source_type = 'class'
      AND source_id = NEW.id
      AND category = 'amnesty_eligible';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classes_remove_notification ON public.classes;
CREATE TRIGGER trg_classes_remove_notification
AFTER UPDATE ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.trg_remove_class_notification();

-- Trigger function: Remove notification when invoice is resolved
CREATE OR REPLACE FUNCTION public.trg_remove_invoice_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('paga', 'paid', 'cancelada') AND 
     (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    DELETE FROM public.teacher_notifications
    WHERE source_type = 'invoice'
      AND source_id = NEW.id
      AND category = 'overdue_invoices';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_remove_notification ON public.invoices;
CREATE TRIGGER trg_invoices_remove_notification
AFTER UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_remove_invoice_notification();

-- Trigger function: Remove notification when class report is created
CREATE OR REPLACE FUNCTION public.trg_remove_report_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.teacher_notifications
  WHERE source_type = 'class'
    AND source_id = NEW.class_id
    AND category = 'pending_reports';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_reports_remove_notification ON public.class_reports;
CREATE TRIGGER trg_class_reports_remove_notification
AFTER INSERT ON public.class_reports
FOR EACH ROW
EXECUTE FUNCTION public.trg_remove_report_notification();

-- Trigger function: Remove orphan notifications when class is deleted
CREATE OR REPLACE FUNCTION public.trg_remove_orphan_class_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.teacher_notifications
  WHERE source_type = 'class'
    AND source_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_classes_remove_orphan_notification ON public.classes;
CREATE TRIGGER trg_classes_remove_orphan_notification
AFTER DELETE ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.trg_remove_orphan_class_notification();

-- Trigger function: Remove orphan notifications when invoice is deleted
CREATE OR REPLACE FUNCTION public.trg_remove_orphan_invoice_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.teacher_notifications
  WHERE source_type = 'invoice'
    AND source_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_remove_orphan_notification ON public.invoices;
CREATE TRIGGER trg_invoices_remove_orphan_notification
AFTER DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_remove_orphan_invoice_notification();
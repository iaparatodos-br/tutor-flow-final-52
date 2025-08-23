-- Audit logging for sensitive financial operations
-- 1) Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NULL,
  target_teacher_id uuid NULL,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  old_data jsonb NULL,
  new_data jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 2) Create a SECURITY DEFINER function to write audit logs (bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_target_teacher_id uuid,
  p_table_name text,
  p_record_id uuid,
  p_operation text,
  p_old_data jsonb,
  p_new_data jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_id,
    target_teacher_id,
    table_name,
    record_id,
    operation,
    old_data,
    new_data
  ) VALUES (
    auth.uid(),
    p_target_teacher_id,
    p_table_name,
    p_record_id,
    p_operation,
    p_old_data,
    p_new_data
  );
END;
$$;

-- 3) Policies to allow professors to read their own audit logs and users to read their own actions
DROP POLICY IF EXISTS "Teachers can view logs for their data" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can view their own audit actions" ON public.audit_logs;

CREATE POLICY "Teachers can view logs for their data"
ON public.audit_logs
FOR SELECT
USING (
  public.is_professor(auth.uid()) AND target_teacher_id = auth.uid()
);

CREATE POLICY "Users can view their own audit actions"
ON public.audit_logs
FOR SELECT
USING (
  actor_id = auth.uid()
);

-- No INSERT/UPDATE/DELETE policies are intentionally created; only the SECURITY DEFINER function should insert.

-- 4) Triggers for payment_accounts
DROP TRIGGER IF EXISTS trg_audit_payment_accounts_ins ON public.payment_accounts;
DROP TRIGGER IF EXISTS trg_audit_payment_accounts_upd ON public.payment_accounts;
DROP TRIGGER IF EXISTS trg_audit_payment_accounts_del ON public.payment_accounts;

CREATE OR REPLACE FUNCTION public.trg_func_audit_payment_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM public.write_audit_log(NEW.teacher_id, TG_TABLE_NAME, NEW.id, TG_OP, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM public.write_audit_log(COALESCE(NEW.teacher_id, OLD.teacher_id), TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.write_audit_log(OLD.teacher_id, TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_payment_accounts_ins
AFTER INSERT ON public.payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_payment_accounts();

CREATE TRIGGER trg_audit_payment_accounts_upd
AFTER UPDATE ON public.payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_payment_accounts();

CREATE TRIGGER trg_audit_payment_accounts_del
AFTER DELETE ON public.payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_payment_accounts();

-- 5) Triggers for stripe_connect_accounts
DROP TRIGGER IF EXISTS trg_audit_stripe_connect_accounts_ins ON public.stripe_connect_accounts;
DROP TRIGGER IF EXISTS trg_audit_stripe_connect_accounts_upd ON public.stripe_connect_accounts;
DROP TRIGGER IF EXISTS trg_audit_stripe_connect_accounts_del ON public.stripe_connect_accounts;

CREATE OR REPLACE FUNCTION public.trg_func_audit_stripe_connect_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM public.write_audit_log(NEW.teacher_id, TG_TABLE_NAME, NEW.id, TG_OP, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM public.write_audit_log(COALESCE(NEW.teacher_id, OLD.teacher_id), TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.write_audit_log(OLD.teacher_id, TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_stripe_connect_accounts_ins
AFTER INSERT ON public.stripe_connect_accounts
FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_stripe_connect_accounts();

CREATE TRIGGER trg_audit_stripe_connect_accounts_upd
AFTER UPDATE ON public.stripe_connect_accounts
FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_stripe_connect_accounts();

CREATE TRIGGER trg_audit_stripe_connect_accounts_del
AFTER DELETE ON public.stripe_connect_accounts
FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_stripe_connect_accounts();

-- 6) Triggers for invoices
DROP TRIGGER IF EXISTS trg_audit_invoices_ins ON public.invoices;
DROP TRIGGER IF EXISTS trg_audit_invoices_upd ON public.invoices;
DROP TRIGGER IF EXISTS trg_audit_invoices_del ON public.invoices;

CREATE OR REPLACE FUNCTION public.trg_func_audit_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_teacher_id uuid;
BEGIN
  -- Determine responsible teacher id for invoice row
  v_teacher_id := COALESCE(NEW.teacher_id, OLD.teacher_id);

  IF (TG_OP = 'INSERT') THEN
    PERFORM public.write_audit_log(v_teacher_id, TG_TABLE_NAME, NEW.id, TG_OP, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM public.write_audit_log(v_teacher_id, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.write_audit_log(v_teacher_id, TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_invoices_ins
AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_invoices();

CREATE TRIGGER trg_audit_invoices_upd
AFTER UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_invoices();

CREATE TRIGGER trg_audit_invoices_del
AFTER DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_invoices();

-- 7) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_teacher_id_created_at ON public.audit_logs (target_teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs (table_name, record_id);


-- Step 1: Create custom composite type for the hourly sweeper
DROP TYPE IF EXISTS billing_relationship_with_tz CASCADE;

CREATE TYPE billing_relationship_with_tz AS (
  relationship_id uuid,
  student_id uuid,
  teacher_id uuid,
  billing_day integer,
  business_profile_id uuid,
  teacher_timezone text
);

-- Step 2: Create the RPC get_relationships_to_bill_now()
-- Returns relationships where:
--   1. Today (in teacher's local time) matches billing_day
--   2. Local hour >= 1 (so billing runs after midnight local)
--   3. No invoice of type 'automated' or 'monthly_subscription' was already created today (local) for this relationship
CREATE OR REPLACE FUNCTION public.get_relationships_to_bill_now()
RETURNS SETOF billing_relationship_with_tz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tsr.id AS relationship_id,
    tsr.student_id,
    tsr.teacher_id,
    tsr.billing_day,
    tsr.business_profile_id,
    COALESCE(p.timezone, 'America/Sao_Paulo') AS teacher_timezone
  FROM teacher_student_relationships tsr
  JOIN profiles p ON p.id = tsr.teacher_id
  WHERE
    -- Today in teacher's local timezone matches their billing_day
    EXTRACT(DAY FROM (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo')))::int = tsr.billing_day
    -- Only process after 1 AM local time (gives buffer for midnight edge)
    AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo')))::int >= 1
    -- Idempotency: no invoice already created today (in teacher's local time) for this pair
    AND NOT EXISTS (
      SELECT 1
      FROM invoices inv
      WHERE inv.teacher_id = tsr.teacher_id
        AND inv.student_id = tsr.student_id
        AND inv.invoice_type IN ('automated', 'monthly_subscription')
        -- Compare created_at (UTC) against the full local day window converted back to UTC
        AND inv.created_at >= (
          DATE_TRUNC('day', NOW() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo'))
          AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo')
        )
        AND inv.created_at < (
          (DATE_TRUNC('day', NOW() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo')) + INTERVAL '1 day')
          AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo')
        )
    );
$$;

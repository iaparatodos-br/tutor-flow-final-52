
-- =============================================================================
-- Drop old RPC signatures that lack p_timezone parameter
-- This resolves PostgREST ambiguity so timezone-aware versions are used
-- =============================================================================

-- 1) count_completed_classes_in_month: drop old 4-arg version
DROP FUNCTION IF EXISTS public.count_completed_classes_in_month(uuid, uuid, integer, integer);

-- 2) get_billing_cycle_dates: drop old 2-arg version  
DROP FUNCTION IF EXISTS public.get_billing_cycle_dates(integer, date);

-- 3) get_student_active_subscription: drop old 1-arg version
DROP FUNCTION IF EXISTS public.get_student_active_subscription(uuid);

-- 4) get_student_subscription_details: drop old 1-arg and 2-arg versions
DROP FUNCTION IF EXISTS public.get_student_subscription_details(uuid);
DROP FUNCTION IF EXISTS public.get_student_subscription_details(uuid, uuid);

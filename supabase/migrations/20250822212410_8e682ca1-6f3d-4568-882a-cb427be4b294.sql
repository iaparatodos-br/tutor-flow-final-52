-- Remove overly permissive policy exposing Stripe connect data
BEGIN;

-- Ensure RLS is enabled (should already be, but we enforce it)
ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

-- Drop the permissive policy that allowed unrestricted access
DROP POLICY IF EXISTS "Edge functions can manage stripe accounts" ON public.stripe_connect_accounts;

COMMIT;
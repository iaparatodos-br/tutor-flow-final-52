-- Add account status monitoring fields to stripe_connect_accounts
ALTER TABLE public.stripe_connect_accounts 
ADD COLUMN account_status text DEFAULT 'active',
ADD COLUMN status_reason text,
ADD COLUMN restrictions jsonb DEFAULT '{}',
ADD COLUMN last_status_check timestamp with time zone DEFAULT now(),
ADD COLUMN charges_disabled_reason text,
ADD COLUMN payouts_disabled_reason text;
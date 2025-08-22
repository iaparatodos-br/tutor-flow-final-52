-- Add Stripe Connect fields to payment_accounts table
ALTER TABLE public.payment_accounts 
ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_onboarding_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT false;

-- Add boleto and PIX fields to invoices table (skip existing columns)
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS boleto_url TEXT,
ADD COLUMN IF NOT EXISTS barcode TEXT,
ADD COLUMN IF NOT EXISTS linha_digitavel TEXT,
ADD COLUMN IF NOT EXISTS pix_qr_code TEXT,
ADD COLUMN IF NOT EXISTS pix_copy_paste TEXT,
ADD COLUMN IF NOT EXISTS stripe_invoice_url TEXT,
ADD COLUMN IF NOT EXISTS gateway_provider TEXT DEFAULT 'stripe';

-- Create stripe_connect_accounts table for detailed management
CREATE TABLE IF NOT EXISTS public.stripe_connect_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id TEXT UNIQUE NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'express', -- express, standard, custom
  charges_enabled BOOLEAN DEFAULT false,
  payouts_enabled BOOLEAN DEFAULT false,
  details_submitted BOOLEAN DEFAULT false,
  requirements JSONB,
  capabilities JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on stripe_connect_accounts
ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies for stripe_connect_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'stripe_connect_accounts' 
    AND policyname = 'Teachers can manage their own stripe accounts'
  ) THEN
    CREATE POLICY "Teachers can manage their own stripe accounts" ON public.stripe_connect_accounts
    FOR ALL
    USING (auth.uid() = teacher_id)
    WITH CHECK (auth.uid() = teacher_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'stripe_connect_accounts' 
    AND policyname = 'Edge functions can manage stripe accounts'
  ) THEN
    CREATE POLICY "Edge functions can manage stripe accounts" ON public.stripe_connect_accounts
    FOR ALL
    USING (true);
  END IF;
END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_teacher_id ON public.stripe_connect_accounts(teacher_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_payment_intent ON public.invoices(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_stripe_connect ON public.payment_accounts(stripe_connect_account_id);
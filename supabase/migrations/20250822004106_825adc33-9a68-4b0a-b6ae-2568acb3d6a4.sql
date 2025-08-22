-- Add Stripe Connect fields to payment_accounts table
ALTER TABLE public.payment_accounts 
ADD COLUMN stripe_connect_account_id TEXT,
ADD COLUMN stripe_onboarding_status TEXT DEFAULT 'pending',
ADD COLUMN stripe_charges_enabled BOOLEAN DEFAULT false,
ADD COLUMN stripe_details_submitted BOOLEAN DEFAULT false,
ADD COLUMN stripe_payouts_enabled BOOLEAN DEFAULT false;

-- Add boleto and PIX fields to invoices table
ALTER TABLE public.invoices 
ADD COLUMN boleto_url TEXT,
ADD COLUMN barcode TEXT,
ADD COLUMN linha_digitavel TEXT,
ADD COLUMN pix_qr_code TEXT,
ADD COLUMN pix_copy_paste TEXT,
ADD COLUMN stripe_payment_intent_id TEXT,
ADD COLUMN stripe_invoice_url TEXT,
ADD COLUMN gateway_provider TEXT DEFAULT 'stripe';

-- Create stripe_connect_accounts table for detailed management
CREATE TABLE public.stripe_connect_accounts (
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
CREATE POLICY "Teachers can manage their own stripe accounts" ON public.stripe_connect_accounts
FOR ALL
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- Create policy for edge functions to manage stripe accounts
CREATE POLICY "Edge functions can manage stripe accounts" ON public.stripe_connect_accounts
FOR ALL
USING (true);

-- Add index for better performance
CREATE INDEX idx_stripe_connect_accounts_teacher_id ON public.stripe_connect_accounts(teacher_id);
CREATE INDEX idx_invoices_stripe_payment_intent ON public.invoices(stripe_payment_intent_id);
CREATE INDEX idx_payment_accounts_stripe_connect ON public.payment_accounts(stripe_connect_account_id);
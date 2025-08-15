-- Extend profiles table for billing automation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guardian_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guardian_email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guardian_phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS billing_day INTEGER DEFAULT 15 CHECK (billing_day >= 1 AND billing_day <= 28);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Extend invoices table for Stripe integration
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('pix', 'boleto', 'card'));
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sent_to_guardian BOOLEAN DEFAULT FALSE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_due_date DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stripe_invoice_url TEXT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_billing_day ON public.profiles(billing_day) WHERE billing_day IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_payment_intent ON public.invoices(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_payment_due_date ON public.invoices(payment_due_date) WHERE payment_due_date IS NOT NULL;
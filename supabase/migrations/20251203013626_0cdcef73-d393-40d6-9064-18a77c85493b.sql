-- Add columns to track pending boleto payments in user_subscriptions
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS pending_payment_method TEXT,
ADD COLUMN IF NOT EXISTS boleto_due_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS boleto_url TEXT,
ADD COLUMN IF NOT EXISTS boleto_barcode TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.user_subscriptions.pending_payment_method IS 'Payment method when subscription is pending (boleto, pix, etc)';
COMMENT ON COLUMN public.user_subscriptions.boleto_due_date IS 'Due date for pending boleto payment';
COMMENT ON COLUMN public.user_subscriptions.boleto_url IS 'URL to download the boleto PDF';
COMMENT ON COLUMN public.user_subscriptions.boleto_barcode IS 'Boleto barcode for easy copying';

-- Create index for efficient querying of pending boletos
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_pending_boleto 
ON public.user_subscriptions (status, pending_payment_method) 
WHERE status = 'pending_boleto';
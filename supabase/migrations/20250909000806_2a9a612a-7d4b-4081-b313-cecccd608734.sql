-- Create pending_refunds table for manual refund processing
CREATE TABLE public.pending_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id),
  teacher_id UUID NOT NULL,
  student_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  reason TEXT NOT NULL DEFAULT 'teacher_subscription_cancelled',
  stripe_payment_intent_id TEXT,
  requires_manual_review BOOLEAN DEFAULT true,
  processed_at TIMESTAMPTZ NULL,
  processed_by UUID NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_refunds ENABLE ROW LEVEL SECURITY;

-- RLS policies for pending_refunds
CREATE POLICY "Teachers can view their pending refunds" 
ON public.pending_refunds 
FOR SELECT 
USING (
  teacher_id = auth.uid() AND 
  teacher_has_financial_module(auth.uid())
);

-- System can insert and update pending refunds
CREATE POLICY "System can manage pending refunds" 
ON public.pending_refunds 
FOR ALL 
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_pending_refunds_updated_at
BEFORE UPDATE ON public.pending_refunds
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add new invoice status for teacher cancellation
-- First check current invoice status constraint
DO $$
BEGIN
  -- Add new status to existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name LIKE '%status%' 
    AND table_name = 'invoices'
  ) THEN
    -- Drop existing constraint and recreate with new status
    ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
  END IF;
  
  -- Create updated constraint with new statuses
  ALTER TABLE public.invoices 
  ADD CONSTRAINT invoices_status_check 
  CHECK (status IN (
    'pendente', 
    'pago', 
    'vencido', 
    'cancelado',
    'cancelada_por_professor_inativo',
    'paga_requer_estorno'
  ));
END $$;
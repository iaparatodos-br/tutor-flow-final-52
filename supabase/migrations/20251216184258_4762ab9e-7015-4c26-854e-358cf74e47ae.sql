-- Add dependent_id column to invoice_classes for audit trail
ALTER TABLE public.invoice_classes
ADD COLUMN IF NOT EXISTS dependent_id uuid REFERENCES public.dependents(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_invoice_classes_dependent_id ON public.invoice_classes(dependent_id);

-- Add comment for documentation
COMMENT ON COLUMN public.invoice_classes.dependent_id IS 'Optional reference to dependent for audit trail when billing dependent classes';
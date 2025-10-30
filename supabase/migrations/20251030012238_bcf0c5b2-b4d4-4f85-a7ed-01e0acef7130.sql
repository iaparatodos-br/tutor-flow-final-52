-- Fix invoice_classes_cancellation_check constraint
-- The current constraint is too restrictive - it requires cancellation_policy_id to be NOT NULL
-- for cancellation_charge items, but in practice, the policy_id can be NULL when no active policy exists

-- Drop the old constraint
ALTER TABLE public.invoice_classes 
DROP CONSTRAINT IF EXISTS invoice_classes_cancellation_check;

-- Add a more flexible constraint
ALTER TABLE public.invoice_classes 
ADD CONSTRAINT invoice_classes_cancellation_check CHECK (
  (item_type = 'cancellation_charge') OR
  (item_type = 'completed_class' AND cancellation_policy_id IS NULL)
);
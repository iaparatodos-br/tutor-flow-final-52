
-- Fix Erik's invoice: mark as paid
UPDATE public.invoices 
SET status = 'paga', 
    payment_origin = 'automatic',
    updated_at = NOW()
WHERE id = 'c9366cc3-50f0-4055-973d-420cd827ae56'
  AND status = 'pendente';

-- Fix class participant: mark as confirmed
UPDATE public.class_participants
SET status = 'confirmada',
    confirmed_at = NOW(),
    updated_at = NOW()
WHERE id = '71728d68-8d2c-43f8-a3b5-e9a7cda1e4d0'
  AND status = 'aguardando_pagamento';

-- The class status will be synced automatically by the trigger sync_class_status_from_participants

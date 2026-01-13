-- Corrigir faturas com status incorreto "paid" para "paga"
UPDATE invoices 
SET status = 'paga', updated_at = now()
WHERE status = 'paid';

-- Normalizar todos os status de faturas em inglês para pt-BR
UPDATE invoices SET status = 'vencida' WHERE status = 'overdue';
UPDATE invoices SET status = 'paga' WHERE status = 'paid';
UPDATE invoices SET status = 'cancelada' WHERE status = 'cancelled';
UPDATE invoices SET status = 'pendente' WHERE status = 'pending';

-- Corrigir professores com assinatura expirada mas status 'active'
-- Definir como 'expired' para que o sistema processe corretamente
UPDATE profiles 
SET subscription_status = 'expired'
WHERE role = 'professor' 
AND subscription_status = 'active'
AND subscription_end_date < NOW();

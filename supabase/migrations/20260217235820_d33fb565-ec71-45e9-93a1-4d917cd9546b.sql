
-- Corrigir user_subscriptions com período expirado
UPDATE user_subscriptions 
SET status = 'expired'
WHERE status = 'active' 
AND current_period_end < NOW();

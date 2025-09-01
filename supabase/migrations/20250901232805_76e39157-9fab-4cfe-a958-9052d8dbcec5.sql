-- Corrigir preços em centavos para os planos mensais (BRL)
UPDATE public.subscription_plans SET price_cents = 2990 WHERE slug = 'basic';
UPDATE public.subscription_plans SET price_cents = 7990 WHERE slug = 'professional';
UPDATE public.subscription_plans SET price_cents = 15990 WHERE slug = 'premium';
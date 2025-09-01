
-- Mapear os preços do Stripe aos planos existentes
UPDATE public.subscription_plans
SET stripe_price_id = 'price_1S2HpVLRY6TVqgv33KedOgqN'
WHERE slug = 'basic';

UPDATE public.subscription_plans
SET stripe_price_id = 'price_1S2HqvLRY6TVqgv36WWVaSOl'
WHERE slug = 'professional';

UPDATE public.subscription_plans
SET stripe_price_id = 'price_1S2Hs7LRY6TVqgv3XwPlAI6H'
WHERE slug = 'premium';

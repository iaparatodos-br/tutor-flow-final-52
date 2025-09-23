-- Atualizar stripe_price_id para ambiente de produção Live
UPDATE subscription_plans 
SET stripe_price_id = 'price_1SAc7bLTWEqZbfWrBFXi35ap' 
WHERE slug = 'basic';

UPDATE subscription_plans 
SET stripe_price_id = 'price_1SAcB0LTWEqZbfWrSShf2qkJ' 
WHERE slug = 'professional';

UPDATE subscription_plans 
SET stripe_price_id = 'price_1SAcCFLTWEqZbfWr8dy4rDNi' 
WHERE slug = 'premium';
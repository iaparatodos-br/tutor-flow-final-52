-- Update plans to add payment_accounts feature controlled by financial module
UPDATE subscription_plans 
SET features = jsonb_set(features, '{payment_accounts}', CASE WHEN features->>'financial_module' = 'true' THEN 'true'::jsonb ELSE 'false'::jsonb END)
WHERE slug IN ('free', 'basic', 'professional', 'premium');
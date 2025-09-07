-- Update basic plan to disable financial module
UPDATE subscription_plans 
SET features = jsonb_set(features, '{financial_module}', 'false')
WHERE slug = 'basic';
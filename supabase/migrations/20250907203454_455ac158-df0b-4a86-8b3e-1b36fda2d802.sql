-- Atualizar os limites de armazenamento dos planos conforme solicitado
UPDATE subscription_plans 
SET features = jsonb_set(features, '{storage_mb}', '150')
WHERE slug = 'free';

UPDATE subscription_plans 
SET features = jsonb_set(features, '{storage_mb}', '500')
WHERE slug = 'basic';

UPDATE subscription_plans 
SET features = jsonb_set(features, '{storage_mb}', '2048')
WHERE slug = 'professional';

UPDATE subscription_plans 
SET features = jsonb_set(features, '{storage_mb}', '10240')
WHERE slug = 'premium';

-- Adicionar a feature material_sharing para todos os planos
UPDATE subscription_plans 
SET features = jsonb_set(features, '{material_sharing}', 'true')
WHERE slug IN ('free', 'basic', 'professional', 'premium');
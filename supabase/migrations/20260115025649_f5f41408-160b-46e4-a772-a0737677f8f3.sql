-- Fase 1: Migração SQL - Métodos de Pagamento Configuráveis v2.0

-- 1. Adicionar métodos habilitados ao business_profiles
ALTER TABLE business_profiles 
ADD COLUMN IF NOT EXISTS enabled_payment_methods TEXT[] DEFAULT ARRAY['boleto', 'pix', 'card'];

-- 2. Adicionar campos de expiração em invoices
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS pix_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS boleto_expires_at TIMESTAMPTZ;

-- 3. Índices para queries de expiração
CREATE INDEX IF NOT EXISTS idx_invoices_pix_expires 
ON invoices(pix_expires_at) WHERE pix_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_boleto_expires 
ON invoices(boleto_expires_at) WHERE boleto_expires_at IS NOT NULL;

-- 4. Comentários para documentação
COMMENT ON COLUMN business_profiles.enabled_payment_methods IS 'Métodos de pagamento habilitados: boleto, pix, card';
COMMENT ON COLUMN invoices.pix_expires_at IS 'Data/hora de expiração do PIX (24h após criação)';
COMMENT ON COLUMN invoices.boleto_expires_at IS 'Data/hora de expiração do boleto (payment_due_days após criação)';
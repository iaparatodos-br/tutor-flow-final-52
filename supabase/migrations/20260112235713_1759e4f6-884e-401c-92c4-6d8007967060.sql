-- Adicionar coluna para método de pagamento padrão
-- Default é 'pix' para incentivar economia de taxas
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS default_payment_method TEXT DEFAULT 'pix' 
CHECK (default_payment_method IN ('pix', 'boleto'));

-- Comentário para documentação
COMMENT ON COLUMN public.profiles.default_payment_method IS 
'Método de pagamento padrão para faturamento automático: pix (1.19%) ou boleto (R$ 3.49 fixo)';
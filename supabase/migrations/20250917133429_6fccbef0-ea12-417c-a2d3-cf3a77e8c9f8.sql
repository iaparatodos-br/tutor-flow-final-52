-- Fase 1: Adicionar apenas a coluna que falta na tabela invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_hosted_invoice_url TEXT;

-- Fase 2: Adicionar a configuração de prazo de pagamento ao perfil do professor
ALTER TABLE public.profiles
  ADD COLUMN payment_due_days INTEGER NOT NULL DEFAULT 15;

-- Adicionar comentários para documentação das colunas existentes e novas
COMMENT ON COLUMN public.invoices.due_date IS 'A data em que a fatura vence e se torna "overdue".';
COMMENT ON COLUMN public.invoices.stripe_invoice_id IS 'O ID da Fatura correspondente no Stripe (ex: in_123...).';
COMMENT ON COLUMN public.invoices.stripe_hosted_invoice_url IS 'A URL da página de pagamento hospedada pelo Stripe para esta fatura.';
COMMENT ON COLUMN public.profiles.payment_due_days IS 'Número de dias após a emissão que uma fatura leva para vencer. Padrão de 15 dias.';
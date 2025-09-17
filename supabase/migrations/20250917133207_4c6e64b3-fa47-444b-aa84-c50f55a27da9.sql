-- Fase 1: Criar o tipo ENUM 'invoice_status' com todos os estados necessários
CREATE TYPE public.invoice_status AS ENUM (
  'pendente', 
  'paga', 
  'falha_pagamento', 
  'cancelada', 
  'overdue', 
  'void'
);

-- Fase 2: Alterar a coluna status da tabela invoices para usar o ENUM
-- Primeiro, fazemos o backup dos dados e convertemos
ALTER TABLE public.invoices 
ALTER COLUMN status TYPE public.invoice_status 
USING status::public.invoice_status;

-- Fase 3: Adicionar colunas que ainda não existem na tabela invoices
-- Verificando o schema atual, algumas colunas já existem, então adicionamos apenas as que faltam
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_hosted_invoice_url TEXT;

-- Adicionar comentários para documentação
COMMENT ON COLUMN public.invoices.due_date IS 'A data em que a fatura vence e se torna "overdue".';
COMMENT ON COLUMN public.invoices.stripe_invoice_id IS 'O ID da Fatura correspondente no Stripe (ex: in_123...).';
COMMENT ON COLUMN public.invoices.stripe_hosted_invoice_url IS 'A URL da página de pagamento hospedada pelo Stripe para esta fatura.';

-- Fase 4: Adicionar a configuração de prazo de pagamento ao perfil do professor
ALTER TABLE public.profiles
  ADD COLUMN payment_due_days INTEGER NOT NULL DEFAULT 15;

COMMENT ON COLUMN public.profiles.payment_due_days IS 'Número de dias após a emissão que uma fatura leva para vencer. Padrão de 15 dias.';
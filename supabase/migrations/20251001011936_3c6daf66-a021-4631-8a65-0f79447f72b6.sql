-- Adicionar campos para rastreamento de cancelamento manual de payment intents
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS payment_origin TEXT CHECK (payment_origin IN ('automatic', 'manual', 'system')),
ADD COLUMN IF NOT EXISTS payment_intent_cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payment_intent_cancelled_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS manual_payment_notes TEXT;

-- Criar índice para melhor performance em queries
CREATE INDEX IF NOT EXISTS idx_invoices_payment_origin ON public.invoices(payment_origin);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_intent_cancelled_at ON public.invoices(payment_intent_cancelled_at);

-- Comentários para documentação
COMMENT ON COLUMN public.invoices.payment_origin IS 'Origem do pagamento: automatic (webhook Stripe), manual (marcado pelo professor), system (ação do sistema)';
COMMENT ON COLUMN public.invoices.payment_intent_cancelled_at IS 'Data/hora quando o payment intent foi cancelado manualmente';
COMMENT ON COLUMN public.invoices.payment_intent_cancelled_by IS 'ID do usuário que cancelou o payment intent manualmente';
COMMENT ON COLUMN public.invoices.manual_payment_notes IS 'Observações adicionadas pelo professor ao marcar como pago manualmente';
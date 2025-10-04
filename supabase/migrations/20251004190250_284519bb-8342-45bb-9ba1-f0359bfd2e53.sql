-- Criar tabela para registrar cobranças imediatas de alunos adicionais
CREATE TABLE IF NOT EXISTS public.student_overage_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'succeeded', 'failed', 'processing'
  extra_students INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar índice para busca eficiente
CREATE INDEX IF NOT EXISTS idx_student_overage_charges_user_id 
ON public.student_overage_charges(user_id);

CREATE INDEX IF NOT EXISTS idx_student_overage_charges_stripe_payment_intent_id 
ON public.student_overage_charges(stripe_payment_intent_id);

-- RLS
ALTER TABLE public.student_overage_charges ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver suas próprias cobranças
CREATE POLICY "Users can view their own overage charges"
  ON public.student_overage_charges
  FOR SELECT
  USING (auth.uid() = user_id);

-- Sistema pode inserir cobranças (via service role)
CREATE POLICY "Service role can insert overage charges"
  ON public.student_overage_charges
  FOR INSERT
  WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_student_overage_charges_updated_at
  BEFORE UPDATE ON public.student_overage_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
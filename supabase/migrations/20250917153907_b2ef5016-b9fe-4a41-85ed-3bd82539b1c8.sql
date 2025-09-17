-- Primeiro, vamos verificar e remover o constraint que está bloqueando a atualização
-- Vamos descobrir o nome do constraint e removê-lo temporariamente
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

-- Adicionar a coluna para o dia de cobrança padrão do professor
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS default_billing_day INTEGER;

COMMENT ON COLUMN public.profiles.default_billing_day IS 'Dia de cobrança padrão a ser sugerido ao cadastrar um novo aluno.';

-- Padronizar os valores da coluna de status para o padrão em inglês
UPDATE public.invoices
SET status = 'open'
WHERE status = 'pendente';

UPDATE public.invoices
SET status = 'paid'
WHERE status = 'paga';

UPDATE public.invoices
SET status = 'void'
WHERE status = 'cancelada';

-- Recriar o constraint com os valores corretos (inglês e português para compatibilidade)
ALTER TABLE public.invoices 
ADD CONSTRAINT invoices_status_check 
CHECK (status IN ('open', 'paid', 'overdue', 'void', 'pendente', 'paga', 'vencida', 'cancelada'));
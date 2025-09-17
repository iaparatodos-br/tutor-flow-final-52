-- Adicionar a coluna para o dia de cobrança padrão do professor
ALTER TABLE public.profiles
ADD COLUMN default_billing_day INTEGER;

COMMENT ON COLUMN public.profiles.default_billing_day IS 'Dia de cobrança padrão a ser sugerido ao cadastrar um novo aluno.';

-- Padronizar os valores da coluna de status para o padrão em inglês
-- Isso é crucial para a consistência com a lógica do webhook e do frontend
UPDATE public.invoices
SET status = 'open'
WHERE status = 'pendente';

UPDATE public.invoices
SET status = 'paid'
WHERE status = 'paga';

UPDATE public.invoices
SET status = 'void'
WHERE status = 'cancelada';

-- Nota: A auditoria apontou a ausência de um ENUM. Manteremos como TEXT por flexibilidade,
-- mas a padronização acima garante a consistência dos dados existentes.
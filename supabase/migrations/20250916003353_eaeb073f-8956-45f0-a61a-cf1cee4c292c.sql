-- Adicionar coluna para relacionar cada Stripe Connect Account com uma Payment Account específica
ALTER TABLE stripe_connect_accounts 
ADD COLUMN payment_account_id UUID REFERENCES payment_accounts(id) ON DELETE CASCADE;

-- Adicionar índice único para garantir que cada payment_account tenha no máximo uma stripe_connect_account
CREATE UNIQUE INDEX idx_stripe_connect_accounts_payment_account_id 
ON stripe_connect_accounts(payment_account_id);

-- Adicionar coluna na tabela invoices para rastrear qual conta foi usada no pagamento
ALTER TABLE invoices 
ADD COLUMN payment_account_used_id UUID REFERENCES payment_accounts(id);

-- Migração de dados existentes: associar contas Stripe Connect existentes com as contas de pagamento padrão dos professores
UPDATE stripe_connect_accounts 
SET payment_account_id = (
  SELECT id 
  FROM payment_accounts 
  WHERE teacher_id = stripe_connect_accounts.teacher_id 
    AND is_default = true 
    AND account_type = 'stripe'
  LIMIT 1
)
WHERE payment_account_id IS NULL;
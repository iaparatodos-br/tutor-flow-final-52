-- Add function to check if teacher has financial module feature
CREATE OR REPLACE FUNCTION teacher_has_financial_module(teacher_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    has_feature boolean := false;
BEGIN
    -- Check if teacher has active subscription with financial_module feature
    SELECT COALESCE(
        (sp.features->>'financial_module')::boolean, 
        false
    ) INTO has_feature
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = teacher_id 
    AND us.status = 'active'
    AND sp.is_active = true;
    
    RETURN COALESCE(has_feature, false);
END;
$$;

-- Add RLS policies for invoices table to enforce financial module access
DROP POLICY IF EXISTS "Teachers can only access invoices if they have financial module" ON invoices;
CREATE POLICY "Teachers can only access invoices if they have financial module" 
ON invoices 
FOR ALL 
TO authenticated
USING (
    CASE 
        WHEN auth.uid() = teacher_id AND is_professor(auth.uid()) THEN teacher_has_financial_module(auth.uid())
        WHEN auth.uid() = student_id THEN true  -- Students can always view their invoices
        ELSE false
    END
)
WITH CHECK (
    CASE 
        WHEN auth.uid() = teacher_id AND is_professor(auth.uid()) THEN teacher_has_financial_module(auth.uid())
        ELSE false
    END
);

-- Add RLS policies for expenses table
DROP POLICY IF EXISTS "Teachers can only access expenses if they have financial module" ON expenses;
CREATE POLICY "Teachers can only access expenses if they have financial module" 
ON expenses 
FOR ALL 
TO authenticated
USING (auth.uid() = teacher_id AND is_professor(auth.uid()) AND teacher_has_financial_module(auth.uid()))
WITH CHECK (auth.uid() = teacher_id AND is_professor(auth.uid()) AND teacher_has_financial_module(auth.uid()));

-- Add RLS policies for payment_accounts table
DROP POLICY IF EXISTS "Teachers can only access payment accounts if they have financial module" ON payment_accounts;
CREATE POLICY "Teachers can only access payment accounts if they have financial module" 
ON payment_accounts 
FOR ALL 
TO authenticated
USING (auth.uid() = teacher_id AND is_professor(auth.uid()) AND teacher_has_financial_module(auth.uid()))
WITH CHECK (auth.uid() = teacher_id AND is_professor(auth.uid()) AND teacher_has_financial_module(auth.uid()));

-- Add RLS policies for stripe_connect_accounts table  
DROP POLICY IF EXISTS "Teachers can only access stripe accounts if they have financial module" ON stripe_connect_accounts;
CREATE POLICY "Teachers can only access stripe accounts if they have financial module" 
ON stripe_connect_accounts 
FOR ALL 
TO authenticated
USING (auth.uid() = teacher_id AND is_professor(auth.uid()) AND teacher_has_financial_module(auth.uid()))
WITH CHECK (auth.uid() = teacher_id AND is_professor(auth.uid()) AND teacher_has_financial_module(auth.uid()));

-- Remove old policies that don't check financial module
DROP POLICY IF EXISTS "Professores podem atualizar suas faturas" ON invoices;
DROP POLICY IF EXISTS "Professores podem excluir suas faturas" ON invoices;
DROP POLICY IF EXISTS "Professores podem inserir suas faturas" ON invoices;
DROP POLICY IF EXISTS "Professores podem selecionar suas faturas" ON invoices;

DROP POLICY IF EXISTS "Professores podem gerenciar suas despesas" ON expenses;

DROP POLICY IF EXISTS "Teachers can delete own payment accounts" ON payment_accounts;
DROP POLICY IF EXISTS "Teachers can insert own payment accounts" ON payment_accounts;
DROP POLICY IF EXISTS "Teachers can select own payment accounts" ON payment_accounts;
DROP POLICY IF EXISTS "Teachers can update own payment accounts" ON payment_accounts;

DROP POLICY IF EXISTS "Teachers can delete own stripe accounts" ON stripe_connect_accounts;
DROP POLICY IF EXISTS "Teachers can insert own stripe accounts" ON stripe_connect_accounts;
DROP POLICY IF EXISTS "Teachers can select own stripe accounts" ON stripe_connect_accounts;
DROP POLICY IF EXISTS "Teachers can update own stripe accounts" ON stripe_connect_accounts;
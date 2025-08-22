-- Secure role check function to avoid recursive RLS issues
CREATE OR REPLACE FUNCTION public.is_professor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND p.role = 'professor'
  );
$$;

-- payment_accounts: tighten policies to professors only
DROP POLICY IF EXISTS "Teachers can manage their own payment accounts" ON public.payment_accounts;

CREATE POLICY "Teachers can select own payment accounts"
ON public.payment_accounts
FOR SELECT
USING (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

CREATE POLICY "Teachers can insert own payment accounts"
ON public.payment_accounts
FOR INSERT
WITH CHECK (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

CREATE POLICY "Teachers can update own payment accounts"
ON public.payment_accounts
FOR UPDATE
USING (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

CREATE POLICY "Teachers can delete own payment accounts"
ON public.payment_accounts
FOR DELETE
USING (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

-- stripe_connect_accounts: professors only
DROP POLICY IF EXISTS "Teachers can manage their own stripe accounts" ON public.stripe_connect_accounts;

CREATE POLICY "Teachers can select own stripe accounts"
ON public.stripe_connect_accounts
FOR SELECT
USING (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

CREATE POLICY "Teachers can insert own stripe accounts"
ON public.stripe_connect_accounts
FOR INSERT
WITH CHECK (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

CREATE POLICY "Teachers can update own stripe accounts"
ON public.stripe_connect_accounts
FOR UPDATE
USING (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

CREATE POLICY "Teachers can delete own stripe accounts"
ON public.stripe_connect_accounts
FOR DELETE
USING (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

-- invoices: keep student SELECT policy, tighten teacher manage policies to professors only
DROP POLICY IF EXISTS "Professores podem gerenciar suas faturas" ON public.invoices;

CREATE POLICY "Professores podem selecionar suas faturas"
ON public.invoices
FOR SELECT
USING (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

CREATE POLICY "Professores podem inserir suas faturas"
ON public.invoices
FOR INSERT
WITH CHECK (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

CREATE POLICY "Professores podem atualizar suas faturas"
ON public.invoices
FOR UPDATE
USING (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

CREATE POLICY "Professores podem excluir suas faturas"
ON public.invoices
FOR DELETE
USING (
  auth.uid() = teacher_id AND public.is_professor(auth.uid())
);

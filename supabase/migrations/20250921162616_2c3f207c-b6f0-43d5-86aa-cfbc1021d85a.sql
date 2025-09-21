-- Add business_profile_id column to invoices table
ALTER TABLE public.invoices
ADD COLUMN business_profile_id UUID REFERENCES public.business_profiles(id) ON DELETE CASCADE;

-- Add comment to explain the column purpose
COMMENT ON COLUMN public.invoices.business_profile_id
IS 'Armazena qual negócio (e sua conta bancária) emitiu e receberá por esta fatura.';
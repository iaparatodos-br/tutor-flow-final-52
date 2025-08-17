-- Create payment_accounts table for managing professor's receiving accounts
CREATE TABLE public.payment_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('pix', 'conta_bancaria', 'stripe')),
  
  -- PIX fields
  pix_key TEXT,
  pix_key_type TEXT CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'telefone', 'chave_aleatoria')),
  
  -- Bank account fields
  bank_code TEXT,
  bank_name TEXT,
  agency TEXT,
  account_number TEXT,
  account_holder_name TEXT,
  account_holder_document TEXT,
  
  -- Stripe fields
  stripe_account_id TEXT,
  
  -- Status fields
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies for payment_accounts
CREATE POLICY "Teachers can manage their own payment accounts" 
ON public.payment_accounts 
FOR ALL 
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- Add preferred_payment_account_id to profiles table
ALTER TABLE public.profiles 
ADD COLUMN preferred_payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_payment_accounts_updated_at
BEFORE UPDATE ON public.payment_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_payment_accounts_teacher_id ON public.payment_accounts(teacher_id);
CREATE INDEX idx_payment_accounts_is_active ON public.payment_accounts(is_active);
CREATE INDEX idx_profiles_preferred_payment_account ON public.profiles(preferred_payment_account_id);
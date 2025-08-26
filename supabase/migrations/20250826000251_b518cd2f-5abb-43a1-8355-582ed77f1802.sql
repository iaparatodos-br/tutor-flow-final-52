-- Add CPF and address fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN cpf TEXT,
ADD COLUMN address_street TEXT,
ADD COLUMN address_city TEXT,
ADD COLUMN address_state TEXT,
ADD COLUMN address_postal_code TEXT,
ADD COLUMN address_complete BOOLEAN DEFAULT false;

-- Add index for CPF lookups
CREATE INDEX idx_profiles_cpf ON public.profiles(cpf);

-- Create function to validate CPF format (basic validation)
CREATE OR REPLACE FUNCTION public.validate_cpf(cpf_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- Remove any non-numeric characters
  cpf_input := regexp_replace(cpf_input, '[^0-9]', '', 'g');
  
  -- Check if CPF has exactly 11 digits
  IF length(cpf_input) != 11 THEN
    RETURN FALSE;
  END IF;
  
  -- Check if all digits are the same (invalid CPFs)
  IF cpf_input ~ '^(.)\1{10}$' THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Add constraint to ensure CPF format when provided
ALTER TABLE public.profiles 
ADD CONSTRAINT check_cpf_format 
CHECK (cpf IS NULL OR validate_cpf(cpf));

-- Update the trigger function to handle new fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
begin
  insert into public.profiles (id, name, email, role, teacher_id, password_changed, address_complete)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'professor'),
    case
      when coalesce(new.raw_user_meta_data->>'role', 'professor') = 'aluno'
        then nullif(new.raw_user_meta_data->>'teacher_id', '')::uuid
      else null
    end,
    -- Set password_changed to false for students, true for professors
    case
      when coalesce(new.raw_user_meta_data->>'role', 'professor') = 'aluno'
        then false
      else true
    end,
    false -- address_complete defaults to false for new users
  );
  return new;
end;
$$;
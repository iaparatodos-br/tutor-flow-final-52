-- Fix search_path for the validate_cpf function
CREATE OR REPLACE FUNCTION public.validate_cpf(cpf_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
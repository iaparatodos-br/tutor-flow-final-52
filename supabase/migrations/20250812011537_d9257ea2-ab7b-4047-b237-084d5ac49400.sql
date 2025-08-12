-- Remove the foreign key constraint from profiles table to allow independent student creation
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Make the profiles table completely independent from auth.users
-- This allows creating student profiles without requiring auth.users entries
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
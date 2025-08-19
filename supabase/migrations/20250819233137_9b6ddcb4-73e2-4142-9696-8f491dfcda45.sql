-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to automatically create profiles when users sign up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add RLS policy to allow users to create their own professor profiles
CREATE POLICY "Users can create their own professor profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id AND role = 'professor');

-- Backfill profiles for existing users who don't have one
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN 
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.profiles p ON au.id = p.id
    WHERE p.id IS NULL
  LOOP
    INSERT INTO public.profiles (id, name, email, role, teacher_id, password_changed)
    VALUES (
      user_record.id,
      COALESCE(user_record.raw_user_meta_data->>'name', split_part(user_record.email, '@', 1)),
      user_record.email,
      COALESCE(user_record.raw_user_meta_data->>'role', 'professor'),
      CASE
        WHEN COALESCE(user_record.raw_user_meta_data->>'role', 'professor') = 'aluno'
          THEN NULLIF(user_record.raw_user_meta_data->>'teacher_id', '')::uuid
        ELSE NULL
      END,
      -- Set password_changed to false for students, true for professors
      CASE
        WHEN COALESCE(user_record.raw_user_meta_data->>'role', 'professor') = 'aluno'
          THEN false
        ELSE true
      END
    );
  END LOOP;
END
$$;
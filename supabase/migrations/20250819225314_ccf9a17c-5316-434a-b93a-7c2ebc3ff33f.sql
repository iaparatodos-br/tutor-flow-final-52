-- Ensure trigger to sync auth.users -> public.profiles on user creation
-- Create trigger only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END$$;

-- Backfill: create missing profiles for existing auth users
INSERT INTO public.profiles (id, name, email, role, teacher_id, password_changed, created_at, updated_at)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) AS name,
  u.email,
  COALESCE(u.raw_user_meta_data->>'role', 'professor') AS role,
  CASE
    WHEN COALESCE(u.raw_user_meta_data->>'role', 'professor') = 'aluno'
      THEN NULLIF(u.raw_user_meta_data->>'teacher_id', '')::uuid
    ELSE NULL
  END AS teacher_id,
  CASE
    WHEN COALESCE(u.raw_user_meta_data->>'role', 'professor') = 'aluno' THEN false
    ELSE true
  END AS password_changed,
  now(),
  now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
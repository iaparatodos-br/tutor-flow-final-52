-- Add password_changed field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN password_changed boolean NOT NULL DEFAULT true;

-- Update existing student profiles to require password change
UPDATE public.profiles 
SET password_changed = false 
WHERE role = 'aluno';

-- Update the handle_new_user function to set password_changed based on role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
begin
  insert into public.profiles (id, name, email, role, teacher_id, password_changed)
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
    end
  );
  return new;
end;
$$;
-- Security Enhancement: Fix database functions search path vulnerability
-- All database functions should use SECURITY DEFINER SET search_path TO '' to prevent search path attacks

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
$function$;

-- Fix user_owns_material function
CREATE OR REPLACE FUNCTION public.user_owns_material(p_material_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.id = p_material_id AND m.teacher_id = auth.uid()
  );
$function$;

-- Fix is_material_shared_with_user function
CREATE OR REPLACE FUNCTION public.is_material_shared_with_user(p_material_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.material_access ma
    WHERE ma.material_id = p_material_id AND ma.student_id = auth.uid()
  );
$function$;

-- Fix ensure_single_default_service function
CREATE OR REPLACE FUNCTION public.ensure_single_default_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    -- Remove o padrão dos outros serviços do mesmo professor
    UPDATE public.class_services 
    SET is_default = false 
    WHERE teacher_id = NEW.teacher_id 
      AND id != NEW.id 
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$function$;
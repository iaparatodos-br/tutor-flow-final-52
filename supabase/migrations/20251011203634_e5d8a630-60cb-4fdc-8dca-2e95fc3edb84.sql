-- Atualizar a função handle_new_user para criar política padrão
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_role text;
BEGIN
  -- Extrair o role dos metadados
  v_role := coalesce(new.raw_user_meta_data->>'role', 'professor');
  
  -- Inserir perfil
  INSERT INTO public.profiles (id, name, email, role, password_changed, address_complete)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_role,
    CASE 
      WHEN v_role = 'aluno' THEN false 
      ELSE true 
    END,
    false
  );
  
  -- Se for professor, criar política de cancelamento padrão
  IF v_role = 'professor' THEN
    INSERT INTO public.cancellation_policies (
      teacher_id,
      hours_before_class,
      charge_percentage,
      allow_amnesty,
      is_active
    ) VALUES (
      new.id,
      24,      -- 24 horas de antecedência
      50.00,   -- 50% de cobrança
      true,    -- Permite anistia
      true     -- Política ativa
    );
  END IF;
  
  RETURN new;
END;
$$;

-- Criar políticas padrão para professores existentes que não têm política
INSERT INTO public.cancellation_policies (
  teacher_id,
  hours_before_class,
  charge_percentage,
  allow_amnesty,
  is_active
)
SELECT 
  p.id,
  24,
  50.00,
  true,
  true
FROM public.profiles p
WHERE p.role = 'professor'
  AND NOT EXISTS (
    SELECT 1 
    FROM public.cancellation_policies cp 
    WHERE cp.teacher_id = p.id
  );
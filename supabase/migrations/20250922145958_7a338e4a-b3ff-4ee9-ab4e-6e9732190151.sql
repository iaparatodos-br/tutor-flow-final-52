-- Fase 2: Implementar RLS Policies aprimoradas para business_profile_id

-- 1. Atualizar política de invoices para considerar business_profile_id
DROP POLICY IF EXISTS "Teachers can only access invoices if they have financial module" ON public.invoices;

CREATE POLICY "Teachers can only access invoices if they have financial module" 
ON public.invoices 
FOR ALL
USING (
  CASE
    WHEN ((auth.uid() = teacher_id) AND is_professor(auth.uid())) THEN 
      teacher_has_financial_module(auth.uid()) AND 
      (business_profile_id IS NULL OR business_profile_id IN (
        SELECT id FROM business_profiles WHERE user_id = auth.uid()
      ))
    WHEN (auth.uid() = student_id) THEN true
    ELSE false
  END
)
WITH CHECK (
  CASE
    WHEN ((auth.uid() = teacher_id) AND is_professor(auth.uid())) THEN 
      teacher_has_financial_module(auth.uid()) AND 
      (business_profile_id IS NULL OR business_profile_id IN (
        SELECT id FROM business_profiles WHERE user_id = auth.uid()
      ))
    ELSE false
  END
);

-- 2. Criar política para teacher_student_relationships considerando business_profile_id
DROP POLICY IF EXISTS "Teachers can manage their student relationships" ON public.teacher_student_relationships;

CREATE POLICY "Teachers can manage their student relationships" 
ON public.teacher_student_relationships 
FOR ALL 
USING (
  auth.uid() = teacher_id AND 
  (business_profile_id IS NULL OR business_profile_id IN (
    SELECT id FROM business_profiles WHERE user_id = auth.uid()
  ))
)
WITH CHECK (
  auth.uid() = teacher_id AND 
  (business_profile_id IS NULL OR business_profile_id IN (
    SELECT id FROM business_profiles WHERE user_id = auth.uid()
  ))
);

-- 3. Adicionar trigger para auditar mudanças em business_profiles
CREATE OR REPLACE FUNCTION public.trg_func_audit_business_profiles()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM public.write_audit_log(NEW.user_id, TG_TABLE_NAME, NEW.id, TG_OP, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM public.write_audit_log(COALESCE(NEW.user_id, OLD.user_id), TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.write_audit_log(OLD.user_id, TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER audit_business_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_business_profiles();

-- 4. Adicionar trigger para auditar mudanças em teacher_student_relationships
CREATE OR REPLACE FUNCTION public.trg_func_audit_teacher_student_relationships()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM public.write_audit_log(NEW.teacher_id, TG_TABLE_NAME, NEW.id, TG_OP, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM public.write_audit_log(COALESCE(NEW.teacher_id, OLD.teacher_id), TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.write_audit_log(OLD.teacher_id, TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER audit_teacher_student_relationships
  AFTER INSERT OR UPDATE OR DELETE ON public.teacher_student_relationships
  FOR EACH ROW EXECUTE FUNCTION public.trg_func_audit_teacher_student_relationships();
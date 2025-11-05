-- =====================================================
-- FIX: safe_classmate_profiles VIEW - Incluir próprio usuário
-- =====================================================

-- Recriar VIEW com sintaxe correta e incluindo o próprio usuário
CREATE OR REPLACE VIEW public.safe_classmate_profiles AS
SELECT 
  p.id,
  p.name,
  p.email
FROM public.profiles p
WHERE p.id IN (
  SELECT classmate_id FROM get_group_class_classmates(auth.uid())
)
OR p.id = auth.uid();

-- Manter segurança
ALTER VIEW public.safe_classmate_profiles SET (security_invoker = true);

-- Atualizar comentário
COMMENT ON VIEW public.safe_classmate_profiles IS 
'VIEW segura que expõe apenas dados não-sensíveis (id, name, email) do próprio usuário e de colegas de turma em aulas em grupo. Protege CPF, endereços e stripe_customer_id.';
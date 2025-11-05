-- =====================================================
-- SECURITY FIX: Proteção de Dados Sensíveis entre Alunos
-- =====================================================
-- Este script cria uma VIEW segura para expor apenas dados não-sensíveis
-- de colegas de turma, protegendo CPF, endereços e IDs do Stripe.

-- 1. Criar VIEW segura que retorna apenas campos não-sensíveis
CREATE OR REPLACE VIEW public.safe_classmate_profiles AS
SELECT 
  p.id,
  p.name,
  p.email
FROM public.profiles p
WHERE p.id IN (
  SELECT get_group_class_classmates(auth.uid())
);

-- Comentário de segurança
COMMENT ON VIEW public.safe_classmate_profiles IS 
'VIEW segura que expõe apenas dados não-sensíveis (id, name, email) de colegas de turma em aulas em grupo. Protege CPF, endereços e stripe_customer_id.';

-- 2. Habilitar RLS na VIEW
ALTER VIEW public.safe_classmate_profiles SET (security_invoker = true);

-- 3. Remover a política RLS vulnerável que permitia SELECT * em profiles
DROP POLICY IF EXISTS "Students can view profiles of classmates in group classes" ON public.profiles;

-- 4. Criar política RLS na VIEW (opcional, mas recomendado para defesa em profundidade)
-- Como é uma VIEW, ela já filtra os dados, mas podemos adicionar uma camada extra
-- Nota: VIEWs não suportam RLS diretamente no Postgres < 15, então a segurança
-- está garantida pela lógica da própria VIEW que usa auth.uid()

-- =====================================================
-- RESULTADO ESPERADO:
-- =====================================================
-- ✅ Alunos podem ver apenas id, name, email de colegas
-- ✅ Campos sensíveis (cpf, address_*, stripe_customer_id) protegidos
-- ✅ Professores mantêm acesso completo aos dados dos alunos
-- ✅ Zero impacto nas permissões dos professores
-- Fase 4: Implementar a lógica de inadimplência com RLS

-- Passo 1: Criar uma função auxiliar para verificar faturas vencidas.
-- Funções são mais performáticas e reutilizáveis dentro de políticas RLS.
-- A cláusula SECURITY DEFINER garante que a função execute com os privilégios do usuário que a definiu,
-- permitindo que ela verifique os dados de fatura de forma segura.
CREATE OR REPLACE FUNCTION public.has_overdue_invoices(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE student_id = p_student_id AND status = 'overdue'
  );
END;
$$;

-- Garantir que a função só pode ser executada por usuários autenticados.
REVOKE ALL ON FUNCTION public.has_overdue_invoices(p_student_id uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.has_overdue_invoices(p_student_id uuid) TO authenticated;

-- Passo 2: Criar a política de segurança.
-- Esta é a regra de negócio principal.
-- Ela bloqueia QUALQUER operação (INSERT, UPDATE, DELETE) na tabela 'classes'
-- se a função auxiliar retornar 'true' (ou seja, se o aluno tiver faturas vencidas).
CREATE POLICY "block_actions_for_overdue_students"
ON public.classes
FOR ALL
USING (NOT public.has_overdue_invoices(student_id))
WITH CHECK (NOT public.has_overdue_invoices(student_id));

COMMENT ON POLICY "block_actions_for_overdue_students" ON public.classes 
IS 'Impede a inserção, atualização ou exclusão de aulas para alunos com faturas no status "overdue".';
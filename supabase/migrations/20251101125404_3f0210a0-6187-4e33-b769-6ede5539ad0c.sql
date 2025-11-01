-- 1. Remover política ALL existente que estava bloqueando materializações
DROP POLICY IF EXISTS "Professores podem gerenciar suas aulas" ON public.classes;

-- 2. Criar política para SELECT
CREATE POLICY "Professores podem visualizar suas aulas"
ON public.classes
FOR SELECT
TO authenticated
USING (auth.uid() = teacher_id);

-- 3. Criar política para INSERT (apenas professores criando suas próprias aulas)
CREATE POLICY "Professores podem criar suas aulas"
ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = teacher_id);

-- 4. Criar política para UPDATE
CREATE POLICY "Professores podem atualizar suas aulas"
ON public.classes
FOR UPDATE
TO authenticated
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- 5. Criar política para DELETE
CREATE POLICY "Professores podem deletar suas aulas"
ON public.classes
FOR DELETE
TO authenticated
USING (auth.uid() = teacher_id);
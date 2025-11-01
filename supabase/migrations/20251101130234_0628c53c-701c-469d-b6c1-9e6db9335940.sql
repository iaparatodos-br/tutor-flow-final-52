-- Corrigir política RLS para materialização de aulas virtuais por alunos
-- Problema: referência ambígua "classes.class_template_id" no contexto de INSERT
-- Solução: remover prefixo e referenciar coluna diretamente

-- 1. Drop da política com problema
DROP POLICY IF EXISTS "students_can_materialize_their_virtual_classes" ON public.classes;

-- 2. Recriar a política com a referência correta
CREATE POLICY "students_can_materialize_their_virtual_classes"
ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (
  -- A aula não pode ser template e deve ter um class_template_id
  is_template = false 
  AND class_template_id IS NOT NULL
  -- Verificar se o aluno é participante do template
  -- IMPORTANTE: sem prefixo "classes." para evitar ambiguidade no contexto de INSERT
  AND EXISTS (
    SELECT 1 
    FROM class_participants cp 
    WHERE cp.class_id = class_template_id  -- Referência direta à coluna sendo inserida
      AND cp.student_id = auth.uid()
  )
);
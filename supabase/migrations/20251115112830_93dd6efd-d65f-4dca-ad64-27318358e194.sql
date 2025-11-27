-- =====================================================
-- FIX: Acesso a Materiais - Validar Relacionamento Ativo
-- SECURITY FIX: Alunos desvinculados perdem acesso imediato
-- =====================================================

-- Modificar função RLS para validar relacionamento ativo
CREATE OR REPLACE FUNCTION public.is_material_shared_with_user(p_material_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Retorna true APENAS se:
  -- 1. Existe material_access para o aluno
  -- 2. Existe relacionamento ATIVO entre aluno e professor
  SELECT EXISTS (
    SELECT 1 
    FROM public.material_access ma
    JOIN public.materials m ON m.id = ma.material_id
    JOIN public.teacher_student_relationships tsr 
      ON tsr.student_id = ma.student_id 
      AND tsr.teacher_id = m.teacher_id
    WHERE ma.material_id = p_material_id 
      AND ma.student_id = auth.uid()
  );
$function$;

COMMENT ON FUNCTION public.is_material_shared_with_user IS 
'Função de segurança RLS: Valida se aluno tem acesso ao material E relacionamento ativo com o professor. Bloqueia acesso de alunos desvinculados.';

-- Limpeza de dados órfãos: Remover material_access de alunos desvinculados
DELETE FROM public.material_access ma
USING public.materials m
WHERE ma.material_id = m.id
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_student_relationships tsr
    WHERE tsr.student_id = ma.student_id
      AND tsr.teacher_id = m.teacher_id
  );
-- ============================================
-- CORREÇÃO: Aulas com múltiplos participantes mas is_group_class=false
-- ============================================
-- Problema: Algumas aulas têm 2+ participantes ativos mas is_group_class=false
-- Isso causa comportamento incorreto no cancelamento (cancela tudo ao invés de remover só 1 aluno)

-- Atualizar aulas inconsistentes para is_group_class=true
UPDATE classes c
SET 
  is_group_class = true,
  updated_at = NOW()
WHERE 
  is_group_class = false
  AND (
    -- Contar participantes ativos (não cancelados/removidos)
    SELECT COUNT(*) 
    FROM class_participants cp 
    WHERE cp.class_id = c.id 
      AND cp.status NOT IN ('cancelada', 'removida')
  ) > 1;

-- Log do resultado
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RAISE NOTICE 'Corrigidas % aulas com is_group_class inconsistente', v_updated_count;
END $$;
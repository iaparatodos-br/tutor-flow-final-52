-- FASE 1 (CORRIGIDA): Remover triggers conflitantes primeiro, depois backup

-- 1. REMOVER TRIGGERS QUE CAUSAM LOOP INFINITO
DROP TRIGGER IF EXISTS ensure_individual_class_participant_trigger ON public.classes;
DROP TRIGGER IF EXISTS trigger_ensure_individual_class_participant ON public.classes;
DROP FUNCTION IF EXISTS public.ensure_individual_class_participant();

-- 2. CRIAR COLUNA DE BACKUP
ALTER TABLE classes 
ADD COLUMN IF NOT EXISTS student_id_legacy uuid;

-- Adicionar FK apenas se a coluna foi criada
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'classes_student_id_legacy_fkey'
  ) THEN
    ALTER TABLE classes 
    ADD CONSTRAINT classes_student_id_legacy_fkey 
    FOREIGN KEY (student_id_legacy) REFERENCES profiles(id);
  END IF;
END $$;

-- 3. COPIAR DADOS PARA BACKUP
UPDATE classes 
SET student_id_legacy = student_id
WHERE student_id IS NOT NULL AND student_id_legacy IS NULL;

-- 4. GARANTIR 100% COBERTURA EM class_participants (SEM TRIGGERS)
INSERT INTO class_participants (
  class_id,
  student_id,
  status,
  billed,
  confirmed_at,
  completed_at,
  created_at,
  updated_at
)
SELECT 
  c.id as class_id,
  c.student_id,
  c.status,
  COALESCE(c.billed, false),
  CASE WHEN c.status IN ('confirmada', 'concluida') THEN c.updated_at ELSE NULL END,
  CASE WHEN c.status = 'concluida' THEN c.updated_at ELSE NULL END,
  c.created_at,
  c.updated_at
FROM classes c
WHERE c.is_template = false
  AND c.student_id IS NOT NULL
  AND c.is_group_class = false
  AND NOT EXISTS (
    SELECT 1 FROM class_participants cp 
    WHERE cp.class_id = c.id AND cp.student_id = c.student_id
  )
ON CONFLICT (class_id, student_id) DO NOTHING;
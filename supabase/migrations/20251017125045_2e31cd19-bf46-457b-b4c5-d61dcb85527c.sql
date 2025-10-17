-- Migration: Adicionar Foreign Key com ON DELETE SET NULL para class_template_id
-- Isso garante que quando uma template é deletada, as aulas materializadas não sejam órfãs

-- Step 1: Verificar se a constraint já existe e removê-la se necessário
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'classes_class_template_id_fkey' 
    AND table_name = 'classes'
  ) THEN
    ALTER TABLE public.classes DROP CONSTRAINT classes_class_template_id_fkey;
  END IF;
END $$;

-- Step 2: Adicionar nova constraint com ON DELETE SET NULL
ALTER TABLE public.classes
ADD CONSTRAINT classes_class_template_id_fkey
FOREIGN KEY (class_template_id)
REFERENCES public.classes(id)
ON DELETE SET NULL;

-- Step 3: Criar índice para melhorar performance de queries com class_template_id
CREATE INDEX IF NOT EXISTS idx_classes_template_id 
ON public.classes(class_template_id) 
WHERE class_template_id IS NOT NULL;

-- Step 4: Comentário explicativo
COMMENT ON CONSTRAINT classes_class_template_id_fkey ON public.classes IS 
'Foreign key com ON DELETE SET NULL: quando template é deletada, aulas materializadas mantêm seus dados mas perdem referência à template';

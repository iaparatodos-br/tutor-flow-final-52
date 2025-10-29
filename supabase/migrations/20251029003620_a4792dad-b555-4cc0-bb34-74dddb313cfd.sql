-- FASE 3: Reforçar trigger para garantir class_participants em aulas individuais

-- Recreate trigger function to handle all individual class scenarios
CREATE OR REPLACE FUNCTION public.ensure_individual_class_participant()
RETURNS TRIGGER AS $$
BEGIN
  -- Se é aula individual (tem student_id e não é grupo/template)
  IF NEW.student_id IS NOT NULL 
     AND NEW.is_group_class = false 
     AND NEW.is_template = false THEN
    
    -- Inserir participante se não existir
    INSERT INTO public.class_participants (
      class_id,
      student_id,
      status,
      billed,
      confirmed_at,
      completed_at
    )
    VALUES (
      NEW.id,
      NEW.student_id,
      NEW.status,
      COALESCE(NEW.billed, false),
      CASE WHEN NEW.status IN ('confirmada', 'concluida') THEN NOW() ELSE NULL END,
      CASE WHEN NEW.status = 'concluida' THEN NOW() ELSE NULL END
    )
    ON CONFLICT (class_id, student_id) DO UPDATE SET
      status = EXCLUDED.status,
      billed = EXCLUDED.billed,
      confirmed_at = CASE 
        WHEN EXCLUDED.status IN ('confirmada', 'concluida') AND class_participants.confirmed_at IS NULL 
        THEN NOW() 
        ELSE class_participants.confirmed_at 
      END,
      completed_at = CASE 
        WHEN EXCLUDED.status = 'concluida' AND class_participants.completed_at IS NULL 
        THEN NOW() 
        ELSE class_participants.completed_at 
      END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recriar trigger para INSERT e UPDATE
DROP TRIGGER IF EXISTS ensure_individual_class_participant_trigger ON public.classes;
CREATE TRIGGER ensure_individual_class_participant_trigger
  AFTER INSERT OR UPDATE OF status ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_individual_class_participant();
-- Remover trigger atual que dispara em INSERT/UPDATE/DELETE
DROP TRIGGER IF EXISTS trg_sync_class_status_from_participants ON public.class_participants;

-- Criar novo trigger que só dispara em UPDATE e DELETE
-- Isso permite que o INSERT inicial preserve o status definido pela aplicação
CREATE TRIGGER trg_sync_class_status_on_participant_change
AFTER UPDATE OR DELETE ON public.class_participants
FOR EACH ROW
EXECUTE FUNCTION public.sync_class_status_from_participants();

-- Comentário explicando a decisão
COMMENT ON TRIGGER trg_sync_class_status_on_participant_change ON public.class_participants IS 
'Sincroniza status da classe quando participantes são atualizados ou removidos. 
Não dispara no INSERT para evitar sobrescrever o status inicial definido pela aplicação.';
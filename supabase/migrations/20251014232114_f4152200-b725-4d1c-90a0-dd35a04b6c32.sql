-- Create trigger to sync class status from participants
-- This ensures that when participants are added/updated/deleted, the class status is updated accordingly

CREATE OR REPLACE TRIGGER trg_sync_class_status_from_participants
AFTER INSERT OR UPDATE OR DELETE ON public.class_participants
FOR EACH ROW
EXECUTE FUNCTION public.sync_class_status_from_participants();
-- Add documentation comments for status centralization deprecation
COMMENT ON COLUMN public.classes.status IS 
'DEPRECATED: Este campo não é mais a fonte de verdade. Use class_participants.status para obter o status real de cada participante. Este campo é mantido apenas para compatibilidade e é sincronizado automaticamente via trigger sync_class_status_from_participants.';

COMMENT ON COLUMN public.class_participants.status IS 
'FONTE DE VERDADE: Este campo define o status individual de cada participante na aula. Valores possíveis: pendente, confirmada, concluida, cancelada, removida.';

-- Create RLS policy for service_role on class_participants
CREATE POLICY "service_role_all_class_participants" 
ON public.class_participants
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create more specific RLS policies for students (hide removed participations)
DROP POLICY IF EXISTS "Alunos podem ver suas participações" ON public.class_participants;

CREATE POLICY "alunos_veem_participacoes_ativas" 
ON public.class_participants 
FOR SELECT
TO authenticated
USING (
  student_id = auth.uid() 
  AND status IN ('pendente', 'confirmada', 'concluida', 'cancelada')
);

CREATE POLICY "professores_veem_todas_participacoes" 
ON public.class_participants 
FOR SELECT
TO authenticated
USING (
  class_id IN (
    SELECT id FROM public.classes WHERE teacher_id = auth.uid()
  )
);

-- 1. Atualizar constraint da tabela classes
ALTER TABLE public.classes
  DROP CONSTRAINT classes_status_check;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_status_check
  CHECK (status = ANY (ARRAY[
    'pendente'::text,
    'confirmada'::text,
    'cancelada'::text,
    'concluida'::text,
    'aguardando_pagamento'::text
  ]));

-- 2. Atualizar constraint da tabela class_participants
ALTER TABLE public.class_participants
  DROP CONSTRAINT class_participants_status_check;

ALTER TABLE public.class_participants
  ADD CONSTRAINT class_participants_status_check
  CHECK (status = ANY (ARRAY[
    'pendente'::text,
    'confirmada'::text,
    'cancelada'::text,
    'concluida'::text,
    'removida'::text,
    'aguardando_pagamento'::text
  ]));

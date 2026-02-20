

# Corrigir Trigger que Sobrescreve Status "Aguardando Pagamento" em Aulas Pre-Pagas

## Causa Raiz

A funcao PostgreSQL `sync_class_status_from_participants` e disparada automaticamente (trigger) toda vez que um participante e inserido/atualizado na tabela `class_participants`. Essa funcao recalcula o status da aula baseado nos participantes, mas **nao reconhece o status `aguardando_pagamento`**.

Fluxo do bug:

```text
1. Professor cria aula prepaid para dependente
2. Codigo insere classe com status = 'aguardando_pagamento'     -- OK
3. Codigo insere participante com status = 'aguardando_pagamento' -- OK
4. TRIGGER dispara sync_class_status_from_participants()
5. Trigger verifica: all_cancelled? NAO, any_concluida? NAO, any_confirmada? NAO
6. ELSE -> v_class_status = 'pendente'                           -- BUG!
7. Classe atualizada para 'pendente', sobrescrevendo 'aguardando_pagamento'
```

O participante mantem o status correto (`aguardando_pagamento`), mas a classe e revertida para `pendente`.

## Solucao

Adicionar reconhecimento do status `aguardando_pagamento` na funcao do trigger, tanto na verificacao quanto na logica de decisao.

### Migration SQL

Atualizar a funcao `sync_class_status_from_participants` para incluir uma verificacao de `aguardando_pagamento`:

```sql
CREATE OR REPLACE FUNCTION public.sync_class_status_from_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_all_cancelled boolean;
  v_any_active boolean;
  v_any_concluida boolean;
  v_any_confirmada boolean;
  v_any_aguardando_pagamento boolean;   -- NOVO
  v_class_status text;
  v_is_group_class boolean;
BEGIN
  SELECT is_group_class INTO v_is_group_class
  FROM public.classes
  WHERE id = COALESCE(NEW.class_id, OLD.class_id);

  SELECT
    COALESCE(BOOL_AND(status IN ('cancelada', 'removida')), false),
    COALESCE(BOOL_OR(status NOT IN ('cancelada', 'removida')), false),
    COALESCE(BOOL_OR(status = 'concluida'), false),
    COALESCE(BOOL_OR(status = 'confirmada'), false),
    COALESCE(BOOL_OR(status = 'aguardando_pagamento'), false)   -- NOVO
  INTO v_all_cancelled, v_any_active, v_any_concluida, v_any_confirmada, v_any_aguardando_pagamento
  FROM public.class_participants
  WHERE class_id = COALESCE(NEW.class_id, OLD.class_id);

  IF v_all_cancelled THEN
    v_class_status := 'cancelada';
  ELSIF v_is_group_class AND v_any_active THEN
    RETURN COALESCE(NEW, OLD);
  ELSIF v_any_concluida THEN
    v_class_status := 'concluida';
  ELSIF v_any_confirmada THEN
    v_class_status := 'confirmada';
  ELSIF v_any_aguardando_pagamento THEN       -- NOVO: antes do ELSE
    v_class_status := 'aguardando_pagamento';
  ELSE
    v_class_status := 'pendente';
  END IF;

  UPDATE public.classes
  SET status = v_class_status, updated_at = NOW()
  WHERE id = COALESCE(NEW.class_id, OLD.class_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;
```

A hierarquia de prioridade fica:
1. `cancelada` (todos cancelados)
2. Grupo com ativos (manter status original)
3. `concluida` (qualquer concluido)
4. `confirmada` (qualquer confirmado)
5. **`aguardando_pagamento`** (qualquer aguardando - NOVO)
6. `pendente` (fallback)

## Impacto

- Corrige aulas pre-pagas criadas pelo professor ficando com status errado
- Nao afeta nenhum fluxo existente (o novo branch so ativa quando nenhum participante tem status mais alto)
- O trigger `trg_sync_class_status_from_participants` ja existe e continuara usando a funcao atualizada sem necessidade de recria-lo

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| Nova migration SQL | Atualizar `sync_class_status_from_participants` para reconhecer `aguardando_pagamento` |

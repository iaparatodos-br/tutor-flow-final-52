
# Correção: Adicionar "aguardando_pagamento" às Constraints do Banco de Dados

## Causa Raiz do Erro

O banco de dados possui duas constraints `CHECK` que restringem os valores válidos para o campo `status`:

- **Tabela `classes`** → `classes_status_check`: aceita apenas `pendente`, `confirmada`, `cancelada`, `concluida`
- **Tabela `class_participants`** → `class_participants_status_check`: aceita apenas `pendente`, `confirmada`, `cancelada`, `concluida`, `removida`

O novo status `aguardando_pagamento` implementado no código não está nessa lista, causando a violação `23514` ao tentar salvar.

## Solução

Uma única migration SQL para remover as constraints antigas e recriá-las incluindo o novo valor `aguardando_pagamento`.

### Migration SQL

```sql
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
```

## Impacto

- Nenhuma alteração de código necessária — o frontend e as edge functions já estão implementados corretamente
- Nenhum dado existente será afetado — a operação apenas amplia os valores aceitos
- Após a migration, o fluxo completo `pendente → aguardando_pagamento → confirmada` funcionará sem erros

## Arquivos Afetados

| Recurso | Alteração |
|---|---|
| Migration SQL | Recria `classes_status_check` com 5 valores |
| Migration SQL | Recria `class_participants_status_check` com 6 valores |

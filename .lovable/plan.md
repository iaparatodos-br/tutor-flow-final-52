

# Fix: Alunos não aparecem na listagem de mensalidades — função duplicada no banco

## Causa Raiz

Existem **duas versões** da função `get_subscription_assigned_students` no banco:
1. `(p_subscription_id uuid)` — sem timezone
2. `(p_subscription_id uuid, p_timezone text DEFAULT 'America/Sao_Paulo')` — com timezone

Quando o Supabase JS client chama `.rpc('get_subscription_assigned_students', { p_subscription_id })` com **1 parâmetro**, o Postgres não consegue decidir qual função usar porque a segunda tem um `DEFAULT` para `p_timezone`. Isso gera o erro `42725: function is not unique`, que faz a query falhar silenciosamente e retornar vazio.

Por isso, ao abrir o modal "Ver Alunos", aparece "Nenhum aluno vinculado" mesmo tendo 2 alunos atribuídos.

## Correção

### Migração SQL

Dropar a versão antiga (sem timezone) e manter apenas a versão com timezone (mais completa):

```sql
DROP FUNCTION IF EXISTS public.get_subscription_assigned_students(uuid);
```

Isso remove a ambiguidade. A versão `(uuid, text DEFAULT 'America/Sao_Paulo')` continua funcionando normalmente quando chamada com apenas `p_subscription_id`.

### Nenhuma mudança no frontend

O hook `useSubscriptionStudents` já chama `.rpc('get_subscription_assigned_students', { p_subscription_id })` corretamente — após remover a duplicata, o Postgres vai resolver para a única função restante usando o default do `p_timezone`.

## Impacto

- **1 migração SQL**: drop da função duplicada
- **0 arquivos de código alterados**
- Após o deploy da migration, o modal de alunos vinculados voltará a funcionar imediatamente


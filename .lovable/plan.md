
## Remover referencia residual a `is_default` na edge function

### Problema
A edge function `get-teacher-availability` ainda referencia `is_default` na clausula `.select()` (linha 102), mas a coluna foi removida da tabela `class_services` pela migracao anterior. Isso causa o erro 400 que voce esta vendo.

### Alteracao necessaria

**`supabase/functions/get-teacher-availability/index.ts`** (linha 102)
- Remover `is_default` do `.select('id, name, price, duration_minutes, is_default')`
- Novo select: `.select('id, name, price, duration_minutes')`

### Analise completa
Verifiquei todo o codebase e os demais usos de `is_default` pertencem a outras tabelas (`expense_categories`, `payment_accounts`) e nao sao afetados pela remocao em `class_services`. Nao ha mais nenhuma referencia pendente alem desta.

### Detalhes tecnicos
A edge function sera redeployada automaticamente apos a edicao, corrigindo o erro 400.

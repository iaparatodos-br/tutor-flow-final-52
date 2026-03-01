
## Corrigir deep-link de faturas vencidas no Inbox

### Problema
O deep-link de notificações de faturas vencidas redireciona para `/faturas?highlight={id}`, mas a rota correta é `/financeiro`.

### Alteração

**Arquivo: `src/types/inbox.ts`** (função `buildNotificationDeepLink`)
- Alterar o retorno do bloco `source_type === 'invoice'` de `/faturas?highlight=${source_id}` para `/financeiro?highlight=${source_id}`

Essa é uma alteração de uma única linha.

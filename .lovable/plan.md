
## Corrigir StripeAccountGuard para consultar a tabela correta

### Problema
O `StripeAccountGuard` consulta a tabela `stripe_connect_accounts` para verificar se o professor tem conta Stripe. Porem, os dados reais da conta Stripe Connect estao na tabela `business_profiles` (coluna `stripe_connect_id`). Para este professor, `stripe_connect_accounts` esta vazia, entao o guard exibe erroneamente o bloqueio "Conta Stripe nao configurada".

### Diagnostico
| Tabela | Dados do professor |
|---|---|
| `business_profiles` | `stripe_connect_id: acct_1SlVXzLmXH1N0Xdo` |
| `stripe_connect_accounts` | Nenhum registro |
| `payment_accounts` | Nenhum registro |

### Solucao
Alterar o `StripeAccountGuard` para consultar `business_profiles` em vez de `stripe_connect_accounts`, ja que e la que os dados de conta Stripe Connect ficam armazenados.

### Alteracoes

**Arquivo: `src/components/StripeAccountGuard.tsx`**

1. Alterar a query de `stripe_connect_accounts` para `business_profiles`
2. Selecionar `stripe_connect_id` de `business_profiles` e usar `user_id` como filtro (em vez de `teacher_id`)
3. Se existir pelo menos um `business_profile` com `stripe_connect_id`, considerar a conta como configurada
4. Remover as verificacoes de `account_status` e `charges_enabled` que nao existem em `business_profiles` -- o guard passa a verificar apenas a existencia de um perfil de negocio com Stripe Connect configurado
5. Se nenhum perfil existir, manter o alerta "Conta Stripe nao configurada"

### Logica simplificada

```text
checkAccountStatus():
  1. Consultar business_profiles WHERE user_id = profile.id
  2. Se retornar registro(s) com stripe_connect_id -> conta existe, liberar acesso
  3. Se nao retornar nenhum registro -> noAccount = true, bloquear
```

Isso alinha o guard com a arquitetura real do sistema, onde `business_profiles` e a fonte de verdade para contas Stripe Connect dos professores.

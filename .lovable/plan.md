
# Etapa 0.1 — Corrigir Status Mismatch pt-BR

## Problema

O sistema padroniza status de faturas em portugues (`paga`, `vencida`, `pendente`, `cancelada`, `falha_pagamento`), porem tres Edge Functions escrevem status em ingles (`paid`, `overdue`). Isso causa:

- Faturas pagas pelo Stripe ficam "invisiveis" no painel financeiro (que filtra por `paga`)
- Faturas vencidas nunca sao encontradas pelo cron job (que busca por `vencida`)
- Confirmacoes manuais do professor podem ser revertidas porque o webhook nao reconhece o status correto

## Alteracoes por Arquivo

### 1. `supabase/functions/webhook-stripe-connect/index.ts` (4 pontos)

| Linha | De | Para |
|-------|-----|------|
| 320 | `status: 'paid'` | `status: 'paga'` |
| 357 | `status: 'paid'` | `status: 'paga'` |
| 404 | `status: 'overdue'` | `status: 'vencida'` |
| 469 | `status: "paid"` | `status: "paga"` |

Handlers afetados:
- `invoice.paid` (linha 320)
- `invoice.payment_succeeded` (linha 357)
- `invoice.marked_uncollectible` (linha 404)
- `payment_intent.succeeded` (linha 469)

### 2. `supabase/functions/cancel-payment-intent/index.ts` (3 pontos)

| Linha | De | Para |
|-------|-----|------|
| 111 | `status: 'paid'` | `status: 'paga'` |
| 172 | `status: 'paid'` | `status: 'paga'` |
| 195 | `status: 'paid'` (audit log new_data) | `status: 'paga'` |

### 3. `supabase/functions/check-overdue-invoices/index.ts` (1 ponto)

| Linha | De | Para |
|-------|-----|------|
| 58 | `status: "overdue"` | `status: "vencida"` |

## O Que NAO Muda

- Os status `falha_pagamento` e `cancelada` ja estao corretos em portugues
- O frontend (`InvoiceStatusBadge`) ja suporta ambos os formatos — mas a fonte da verdade deve ser portugues
- Nenhuma migracao de banco necessaria
- Nenhuma alteracao de traducoes

## Resumo

- 3 arquivos modificados
- 8 substituicoes de string (todas triviais e sem risco de efeito colateral)
- Apos deploy, as Edge Functions passam a escrever status consistentes com o padrao pt-BR do sistema

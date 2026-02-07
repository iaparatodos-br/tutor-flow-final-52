
# Plano de Implementação: Cobrança Híbrida - v2.0 Completa

## Status: Documento atualizado para v2.0 com 87 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 2.0, incorporando 6 novos gaps técnicos (82-87) identificados na revisão mais recente.

## Gaps incorporados na v2.0

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 82 | Handlers `invoice.paid` e `invoice.marked_uncollectible` retornam HTTP 500 SEM chamar `completeEventProcessing(false, error)` — diferente do Gap 79 (pattern if/else), estes fazem **early return** bypassando completamente a linha 544 | Evento fica permanentemente preso em "processing" no sistema de idempotência. Retries do Stripe são rejeitados indefinidamente |
| 83 | Outer `catch` do webhook (linhas 551-558) não chama `completeEventProcessing(false, error)` | Erros não capturados pós-idempotência deixam evento preso. Mesma consequência do Gap 82 |
| 84 | Handler `invoice.paid` proposto atualiza `class_participants.status` para `confirmada` com `.neq('status', 'cancelada')` mas NÃO exclui `concluida` | Se professor completou a aula antes do pagamento (ex: boleto pago dias depois), status reverte de `concluida` para `confirmada` |
| 85 | Código proposto na seção 5.3 (linha 766) usava `paidInvoice.account as string` — contradizia Gap 80 que especifica `event.account` | Inconsistência interna no plano. Corrigido para `(event as any).account \|\| (paidInvoice as any).account` |
| 86 | `invoice.marked_uncollectible` NÃO verifica `payment_origin === 'manual'` (os outros handlers já verificam) | Se professor marcou pagamento manualmente e Stripe marca invoice como incobrável, webhook sobrescreveria `paid` com `overdue` |
| 87 | Proposta de `invoice.paid` fazia 2 queries separadas para a mesma invoice (manual check + payment_origin check) | Redundância e desperdício de DB calls. Consolidado em UMA query com `.maybeSingle()` + null guard + manual check |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.

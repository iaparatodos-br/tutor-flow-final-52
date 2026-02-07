
# Plano de Implementação: Cobrança Híbrida - v1.9 Completa

## Status: Documento atualizado para v1.9 com 81 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 1.9, incorporando 6 novos gaps técnicos (76-81) identificados na revisão mais recente.

## Gaps incorporados na v1.9

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 76 | **CRÍTICO**: `process-class-billing` não verifica `student_monthly_subscriptions.is_active` | Alunos com mensalidade seriam cobrados pré-pago E perderiam franquia do plano (dupla cobrança) |
| 77 | `process-class-billing` não valida ownership dos `class_ids` | Professor poderia processar billing de aulas de outro professor |
| 78 | Gap 71 afirma que `Faturas.tsx` usa `PaymentOptionsCard` — INCORRETO | `Faturas.tsx` NÃO importa `PaymentOptionsCard`. Correção real: ocultar botão `change-payment-method` para faturas `prepaid_class` |
| 79 | Handlers `invoice.voided`, `invoice.payment_failed`, `payment_intent.payment_failed` não chamam `completeEventProcessing(false, error)` | Erros nesses handlers são marcados como sucesso, impedindo retries |
| 80 | `invoice.paid` handler extrai `stripeAccountId` do objeto invoice (pode ser null) | Deve usar `event.account` (campo confiável para Connect webhooks) com fallback |
| 81 | `invoice.payment_failed` para faturas pré-pagas não tem tratamento específico documentado | Edge case: aula fica `confirmada` mas sem pagamento. Professor decide ação. |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.

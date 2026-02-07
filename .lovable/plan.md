
# Plano de Implementação: Cobrança Híbrida - v1.5 Completa

## Status: Documento atualizado para v1.5 com 57 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 1.5, incorporando 8 novos gaps técnicos (50-57) identificados na revisão mais recente.

## Gaps incorporados na v1.5

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 50 | `send-invoice-notification` requer `notification_type` obrigatório | Falha silenciosa no envio de email |
| 51 | View `class_billing_status` não tem `has_prepaid_invoice` | Query incorreta na Agenda |
| 52 | Versão do Stripe SDK inconsistente entre functions | Incompatibilidades de tipos |
| 53 | Webhook sobrescreve `payment_origin: 'prepaid'` com `'automatic'` | Perda de rastreabilidade |
| 54 | `process-cancellation` usa `.limit(1)` para faturas | Faturas não anuladas em grupo |
| 55 | Sem feedback visual no Agenda após billing | UX silenciosa para professor |
| 56 | Handlers webhook sem `completeEventProcessing` em erros | Idempotência inconsistente |
| 57 | `for await` incompatível com Stripe SDK no Deno | Falha na paginação de items |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.

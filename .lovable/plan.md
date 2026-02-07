
# Plano de Implementação: Cobrança Híbrida - v1.6 Completa

## Status: Documento atualizado para v1.6 com 63 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 1.6, incorporando 6 novos gaps técnicos (58-63) identificados na revisão mais recente.

## Gaps incorporados na v1.6

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 58 | Versão Stripe SDK divergente: plano dizia `v14.21.0` mas webhook usa `v14.24.0` | Incompatibilidade de tipos e comportamento |
| 59 | Handler `payment_intent.succeeded` sobrescreve `payment_origin: 'prepaid'` | Perda de rastreabilidade (mesma causa do Gap 53) |
| 60 | CORS headers faltam headers específicos do Supabase | Requisições bloqueadas pelo preflight |
| 61 | `process-class-billing` usa `teacher_id` do body sem validação JWT | Vulnerabilidade de segurança |
| 62 | `create-payment-intent-connect` cria customers sem persistir ID | Customers Stripe duplicados |
| 63 | `get_unbilled_participants_v2` filtra por `participant_id` — não documentado | Confusão em testes de billing parcial em grupo |

## Gaps anteriores (v1.5)

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

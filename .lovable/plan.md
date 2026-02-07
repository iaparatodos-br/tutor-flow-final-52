
# Plano de Implementação: Cobrança Híbrida - v1.8 Completa

## Status: Documento atualizado para v1.8 com 75 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 1.8, incorporando 6 novos gaps técnicos (70-75) identificados na revisão mais recente.

## Gaps incorporados na v1.8

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 70 | `process-cancellation` lookup de participante não filtra por `dependent_id` | Voiding incorreto de TODAS as faturas quando responsável tem 2+ dependentes na mesma aula |
| 71 | `Faturas.tsx` não diferencia faturas pré-pagas para o aluno | `PaymentOptionsCard` conflita com Stripe Invoice flow para faturas `prepaid_class` |
| 72 | `invoice.payment_succeeded` hardcoda `payment_method: 'stripe_invoice'` | Perde informação do método real usado (boleto/pix/card) |
| 73 | Deploy checklist não inclui `automated-billing` para redeployment | FK joins podem ficar stale após migração de schema |
| 74 | `create-payment-intent-connect` não listado como arquivo a modificar | Atualização do SDK v14.21.0→v14.24.0 não rastreada |
| 75 | Webhook handlers usam `.single()` para buscar invoices | Invoices não encontradas causam erro 500 → retries infinitos do Stripe |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.

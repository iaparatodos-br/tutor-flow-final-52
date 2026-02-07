
# Plano de Implementação: Cobrança Híbrida - v1.4 Completa

## Status: Documento atualizado para v1.4 com 49 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 1.4, incorporando 12 novos gaps técnicos (38-49) identificados na revisão mais recente.

## Gaps incorporados na v1.4

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 38 | `send-invoice-notification` não invocado | Aluno não recebe notificação |
| 39 | `stripe_customer_id` não persistido | Re-criação desnecessária de customers |
| 40 | `expand: ['lines']` limitado a 10 items | Falha em aulas com >10 participantes |
| 41 | Erros no webhook sem `completeEventProcessing` | Sistema de idempotência inconsistente |
| 42 | `payment_origin: 'prepaid'` ausente | Impossível diferenciar origem da fatura |
| 43 | Handler `invoice.payment_succeeded` sem código | Lógica incompleta no webhook |
| 44 | Descrição imprecisa para múltiplos serviços | UX confusa para aluno |
| 45 | `class_id` indefinido para faturas multi-aula | Ambiguidade no banco |
| 46 | Query direta em vez de view `class_billing_status` | Ineficiência na Agenda |
| 47 | Rollback de Invoice Items sem detalhamento | Dados órfãos no Stripe |
| 48 | Sem idempotência contra double-click | Cobrança duplicada |
| 49 | `apiVersion` Stripe inconsistente | Comportamento imprevisível |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.

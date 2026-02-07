
# Plano de Implementação: Cobrança Híbrida - v2.6 Completa

## Status: Documento atualizado para v2.6 com 143 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 2.6, incorporando 10 novos gaps técnicos (134-143) identificados na revisão mais recente.

## Gaps incorporados na v2.6

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 134 | `process-class-billing` não valida `classes.status` — pode cobrar aulas canceladas (race condition) | Cobrança de aula já cancelada |
| 135 | Falha parcial em grupo billing não identifica quais alunos falharam | Professor sem visibilidade para cobrança manual |
| 136 | Deploy checklist não menciona adicionar `invoice.finalized` no Stripe Dashboard | Evento nunca entregue, Gap 90 inútil |
| 137 | BillingSettings com múltiplos business_profiles mostra charge_timing potencialmente errado | UX confusa |
| 138 | `paymentOrigins.prepaid` documentado no Gap 128 mas NÃO aplicado na seção 6.3 | Texto raw no dashboard |
| 139 | `invoice.payment_succeeded` — código completo não fornecido | Alto risco de erro na implementação |
| 140 | Dual webhook events para prepaid — comportamento não documentado | Confusão durante debug |
| 141 | `send-invoice-notification` não prioriza `stripe_hosted_invoice_url` | Email sem link de pagamento |
| 142 | `original_amount` não setado em invoices prepaid | Inconsistência em relatórios |
| 143 | **CRÍTICO UX**: Falha de invocação de billing é silenciosa | Aula criada sem fatura, sem aviso |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.
Prioridade zero: corrigir Gaps 103-106 + 115 no webhook existente.

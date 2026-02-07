
# Plano de Implementação: Cobrança Híbrida - v2.7 Completa

## Status: Documento atualizado para v2.8 com 155 gaps corrigidos

O documento `docs/hybrid-billing-implementation-plan.md` foi atualizado para a versão 2.8, incorporando 6 novos gaps técnicos (150-155) identificados na revisão cruzada com o código-fonte real.

## Gaps incorporados na v2.7

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| 150 | **CRÍTICO**: `const stripeAccountId` declarado 2x na seção 5.3 → `SyntaxError` | Código proposto não compilaria |
| 151 | Gap 118 rollback não deleta registro local em `invoices` se `invoice_classes` falhar | Invoice órfã no banco sem line items |
| 152 | Gap 82 descreve `invoice.voided` incorretamente (real: if/else sem return) | Implementador pode aplicar fix errado |
| 153 | Gap 3 diz para adicionar Stripe import que já existe em `process-cancellation` | Confusão na implementação |
| 154 | Deploy checklist não verifica `SITE_URL` env var | Emails com links quebrados |
| 155 | Gap 145 cobre só `invoice_created` — reminder e overdue também precisam CTA prepaid | Aluno sem link de pagamento em lembretes |

## Próximos passos

Documento pronto para implementação. Seguir fases 1-8 conforme sequência definida.
Prioridade zero: corrigir Gaps 103-106 + 115 no webhook existente.



# Verificação Final v5.31 — 3 Novas Pontas Soltas Identificadas

## Veredicto: Plano atualizado para v5.31 com 3 novos gaps críticos.

---

## Auditoria Profunda Realizada (Funções Core)

Funções auditadas nesta rodada:
- `create-invoice/index.ts` (575 linhas)
- `automated-billing/index.ts` (1057 linhas)
- `create-payment-intent-connect/index.ts` (659 linhas)
- `check-overdue-invoices/index.ts` (152 linhas)
- `verify-payment-status/index.ts` (124 linhas)
- `cancel-payment-intent/index.ts` (250 linhas)

### Novos Gaps Encontrados (#187-#189)

1. **#187 (ALTA → Fase 0)**: `check-overdue-invoices` sobrescreve faturas pagas para `overdue` sem guard clause. Cron job automático pode reverter confirmações manuais do professor.

2. **#188 (MÉDIA)**: `cancel-payment-intent` marca `payment_origin: 'manual'` mesmo quando o PI já `succeeded` no Stripe, corrompendo dados de auditoria.

3. **#189 (ALTA)**: `automated-billing/processMonthlySubscriptionBilling` não verifica se já existe fatura de mensalidade para o ciclo atual. Se cron executar duas vezes, duplica a cobrança.

### Totais Atualizados (v5.31)
- 189 pontas soltas totais
- 18 duplicatas + 2 subsumidas
- 169 únicas
- 10 implementadas
- **159 pendentes**
- Fase 0: **9 itens** (adicionado #187)

### Status Final
O documento está **pronto para execução da Fase 0** com 9 itens críticos.

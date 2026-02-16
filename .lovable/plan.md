


# Verificação Final v5.35 — 10 Novas Pontas Soltas em Webhooks, Downgrade e Status de Faturas

## Veredicto: Plano atualizado para v5.35 com 3 bugs críticos de corrupção de dados e 1 bug funcional de downgrade.

---

## Auditoria Profunda Realizada (Funções de Pagamento, Webhooks e Downgrade)

Funções auditadas nesta rodada:
- `cancel-payment-intent/index.ts` (250 linhas) — status 'paid' em inglês + `.single()`
- `webhook-stripe-connect/index.ts` (560 linhas) — status em inglês em 4 handlers + sem guards
- `webhook-stripe-subscriptions/index.ts` (802 linhas) — HTTP 400/500 para erros não-críticos
- `process-payment-failure-downgrade/index.ts` (280 linhas) — parâmetros errados em smart-delete-student
- `create-payment-intent-connect/index.ts` (659 linhas) — sem guard de status na fatura
- `automated-billing/index.ts` (1057 linhas) — FK join syntax (confirmação)
- `create-invoice/index.ts` (575 linhas) — `.single()` em relationship lookup
- `smart-delete-student/index.ts` (547 linhas) — interface confirmada (requer student_id, teacher_id, relationship_id)
- `end-recurrence/index.ts` (133 linhas) — confirmação de #181 (FK constraint)

### Novos Gaps Encontrados (#199-#208)

1. **#199 (ALTA → Fase 0)**: `cancel-payment-intent` marca faturas como `status: 'paid'` (inglês) em vez de `'paga'` (português) nas linhas 111 e 172. TODAS as confirmações manuais de pagamento ficam invisíveis no dashboard financeiro.

2. **#200 (BAIXA)**: `cancel-payment-intent` usa `.single()` na linha 71 para buscar fatura.

3. **#201 (MÉDIA)**: `process-payment-failure-downgrade` usa `.single()` nas linhas 55 e 95 para subscription e plan lookups.

4. **#202 (ALTA → Fase 0)**: `process-payment-failure-downgrade` invoca `smart-delete-student` com `{ studentId, reason }` mas a função espera `{ student_id, teacher_id, relationship_id }`. Nenhum aluno excedente é removido no downgrade por falha de pagamento.

5. **#203 (ALTA → Fase 0)**: `webhook-stripe-connect` usa status em inglês: `'paid'` (linhas 320, 359, 469) e `'overdue'` (linha 404). Estes são os handlers PRIMÁRIOS para pagamentos via Stripe Connect — todos os pagamentos confirmados ficam invisíveis.

6. **#204 (MÉDIA)**: `webhook-stripe-connect` handlers `invoice.paid` e `invoice.payment_succeeded` usam `.single()` sem fallback por `stripe_payment_intent_id`.

7. **#205 (MÉDIA)**: `webhook-stripe-connect` handlers `invoice.payment_failed` e `invoice.voided` não possuem guards contra sobrescrita de status `'paga'`.

8. **#206 (MÉDIA)**: `webhook-stripe-connect` e `webhook-stripe-subscriptions` retornam HTTP 500 no catch global, causando loops de retentativa do Stripe.

9. **#207 (MÉDIA)**: `webhook-stripe-subscriptions` retorna HTTP 400 para "user not found" em 4 handlers, causando retentativas desnecessárias.

10. **#208 (MÉDIA)**: `create-payment-intent-connect` não verifica status da fatura antes de criar Payment Intent. Pode gerar cobranças duplicadas.

### Totais Atualizados (v5.35)
- 208 pontas soltas totais
- 18 duplicatas + 2 subsumidas
- 188 únicas
- 10 implementadas
- **178 pendentes**
- Fase 0: **14 itens** (+3: #199, #202, #203)

### Status Final
O documento está **pronto para execução da Fase 0** com 14 itens críticos.



# Verificação Final v5.42 — 8 Novas Pontas Soltas (5ª Passagem: Webhooks, Subscrições e Student Management)

## Veredicto: Plano atualizado para v5.42 com 2 bugs ALTOS adicionais (webhook catch blocks retornam HTTP 500, e handlers de falha/void não protegem status terminal).

---

## Auditoria de 5ª Passagem (Webhooks, Subscrições e Gestão de Alunos — Análise Cruzada de Chamadas)

Funções auditadas nesta rodada (5ª passagem — análise de chamadas cruzadas):
- `webhook-stripe-connect/index.ts` (560 linhas) — **ALTO: 3× `.single()` em payment_origin check** (#250), **ALTO: handlers de falha sem guard de status** (#251), **ALTO: catch retorna HTTP 500** (#256)
- `webhook-stripe-subscriptions/index.ts` (802 linhas) — **ALTO: catch retorna HTTP 500** (#257)
- `smart-delete-student/index.ts` (547 linhas) — Já coberto por #240 (ownership)
- `process-payment-failure-downgrade/index.ts` (280 linhas) — **CONFIRMAÇÃO #109: parâmetros errados para smart-delete** (#252), **MÉDIA: 2× `.single()`** (#253)
- `handle-student-overage/index.ts` (238 linhas) — **MÉDIA: `.single()` em user_subscriptions** (#255)
- `generate-boleto-for-invoice/index.ts` (187 linhas) — OK (já corrigido com .maybeSingle() e guard clause)
- `request-class/index.ts` (223 linhas) — **CONFIRMAÇÃO #138: não define `is_paid_class`** (#254)
- `create-student/index.ts` (529 linhas) — OK (auth robusta, ownership validada)
- `check-subscription-status/index.ts` (846 linhas) — Já coberto por #241

### Novos Gaps Encontrados (#250-#257)

1. **#250 (ALTA → Fase 0)**: `webhook-stripe-connect` usa `.single()` em 3 lookups de `payment_origin` (L310, L347, L457) antes de atualizar status de fatura. Se a fatura não existir no banco pelo `stripe_invoice_id`, lança exceção HTTP 500. O Stripe então retenta o webhook indefinidamente. **Fallback ausente**: não tenta buscar por `stripe_payment_intent_id` quando `stripe_invoice_id` não encontra resultado. Deveria usar `.maybeSingle()`.

2. **#251 (ALTA → Fase 0)**: `webhook-stripe-connect` handlers `invoice.payment_failed` (L380-386), `invoice.marked_uncollectible` (L401-407) e `invoice.voided` (L425-431) atualizam status para `'falha_pagamento'`, `'overdue'` e `'cancelada'` **sem guard clause** `.in('status', ['pendente', 'open', ...])`. Se a fatura já está paga (`'paga'` ou `'paid'` por causa do #237), o webhook pode reverter o status terminal. **Risco**: professor vê fatura como "vencida" quando o pagamento já foi processado.

3. **#252 (CONFIRMAÇÃO de #109)**: `process-payment-failure-downgrade` (L144-149) invoca `smart-delete-student` com `{ studentId: student.student_id, reason: 'payment_failure_downgrade' }` mas a função target espera `{ student_id, teacher_id, relationship_id }`. A chamada **SEMPRE falha** com "Missing required fields". Resultado: alunos excedentes NUNCA são removidos automaticamente quando há falha de pagamento.

4. **#253 (MÉDIA)**: `process-payment-failure-downgrade` usa `.single()` em `user_subscriptions` (L55) e `subscription_plans` (L95). Se o registro não existir, lança HTTP 500 genérico.

5. **#254 (CONFIRMAÇÃO de #138)**: `request-class` (L137-146) não define `is_paid_class` ao criar aula via solicitação de aluno. Herda DEFAULT `true` do banco, potencialmente disparando cobrança imediata no modelo prepaid, mesmo para aulas que deveriam seguir o timing do professor.

6. **#255 (MÉDIA)**: `handle-student-overage` (L79) usa `.single()` em `user_subscriptions`. Se não houver assinatura ativa, lança exceção em vez de retornar graciosamente.

7. **#256 (ALTA → Fase 0)**: `webhook-stripe-connect` catch block (L555) retorna HTTP 500. **Qualquer** erro não tratado causa retentativas infinitas do Stripe. Deve retornar HTTP 200 com `{ received: true, error: message }`.

8. **#257 (ALTA → Fase 0)**: `webhook-stripe-subscriptions` catch block (L715) retorna HTTP 500. Mesmo problema do #256. Parcialmente documentado em #238 (que cobria apenas os returns explícitos de HTTP 400), mas o catch final NÃO estava coberto.

### Totais Atualizados (v5.42)
- 257 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 4 confirmações (#246→#196, #247→#181, #252→#109, #254→#138)
- 233 únicas (descontando confirmações)
- 10 implementadas
- **221 pendentes**
- Fase 0: **26 itens** (+4: #250, #251, #256, #257)
- **100% cobertura**: 75 funções auditadas (5ª passagem em webhooks, subscrições e student management)

### Status Final
O documento está **pronto para execução da Fase 0** com 26 itens críticos. Prioridade: #237 (3 linhas) → #243 (1 guard) → #251 (3 guards no mesmo arquivo) → #250 (3× .maybeSingle()) → #256/#257 (catch blocks).

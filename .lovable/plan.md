


# Verificação Final v5.46 — 13 Novas Pontas Soltas (9ª Passagem: Análise Cruzada Profunda — Webhooks, Pagamentos, Cancelamento e Checkout)

## Veredicto: Plano atualizado para v5.46 com 7 achados CRÍTICOS — webhook status em inglês, process-cancellation sem auth, webhook retries, checkout race condition, webhook .single() crashes.

---

## Auditoria de 9ª Passagem (Análise Cruzada Profunda)

Funções auditadas nesta rodada (9ª passagem — análise cruzada):
- `webhook-stripe-connect/index.ts` (560 linhas) — status em inglês (#287, #288), .single() em invoice lookups (#297)
- `webhook-stripe-subscriptions/index.ts` (802 linhas) — HTTP 400 para user not found (#294), .single() em plans L346
- `create-subscription-checkout/index.ts` (372 linhas) — .single() em subscriptions L175 (#295), cancela assinatura antes de confirmar (#296)
- `create-payment-intent-connect/index.ts` (659 linhas) — SEM AUTH (#175 confirmado), .single() em invoice L51
- `process-cancellation/index.ts` (500 linhas) — SEM AUTH (#289), identity spoofing (#290), .single() em dependent L107
- `create-invoice/index.ts` (575 linhas) — FK joins proibidos L233 (#291), .single() em relationship L154 (#292)
- `verify-payment-status/index.ts` (124 linhas) — SEM AUTH (#293 confirma #195)
- `change-payment-method/index.ts` (253 linhas) — double .eq() em L84-85 (#261 confirmado)
- `handle-student-overage/index.ts` (238 linhas) — tabela inexistente (#298 confirma memória)
- `resend-confirmation/index.ts` (202 linhas) — listUsers() sem filtro (#299 confirma memória)
- `audit-logger/index.ts` (86 linhas) — colunas erradas (#277 confirmado)
- `smart-delete-student/index.ts` (547 linhas) — SEM AUTH (#282 confirmado), FK joins L132-139

### Achados Críticos (→ Fase 0)

1. **#287 (ALTA)**: `webhook-stripe-connect` — `invoice.paid` (L320) e `payment_intent.succeeded` (L469) escrevem `status: "paid"` em inglês → faturas invisíveis no dashboard. Extensão de #237.

2. **#288 (ALTA)**: `webhook-stripe-connect` — `invoice.marked_uncollectible` (L404) escreve `status: "overdue"` → faturas inadimplentes invisíveis. Extensão de #237.

3. **#289 (ALTA)**: `process-cancellation` — **ZERO autenticação**. Aceita `cancelled_by` do body sem validar JWT.

4. **#290 (ALTA)**: `process-cancellation` — **Identity spoofing** via `cancelled_by` forjado. Extensão de #289.

5. **#294 (ALTA)**: `webhook-stripe-subscriptions` — HTTP 400 para "User not found" causa retries infinitos do Stripe.

6. **#296 (ALTA)**: `create-subscription-checkout` — cancela assinatura Stripe ANTES do checkout completar. Race condition crítica.

7. **#297 (ALTA)**: `webhook-stripe-connect` — `.single()` em invoice lookups (3 handlers). Evento órfão → crash 500 → retries infinitos.

### Totais Atualizados (v5.46)
- 299 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 10 confirmações
- 269 únicas
- 10 implementadas
- **257 pendentes**
- Fase 0: **38 itens** (+7: #287, #288, #289, #290, #294, #296, #297)
- **100% cobertura**: 75 funções auditadas (9 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (38 itens críticos), seguido por batch fix de `.single()` em funções de notificação (~30 substituições) e utilitários (~15 substituições).

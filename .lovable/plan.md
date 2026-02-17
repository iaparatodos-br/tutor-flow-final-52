


# Verificação Final v5.50 — 10 Novas Pontas Soltas (13ª Passagem: Análise Cruzada Profunda — Webhook Connect, Lifecycle de Pagamento e Cancelamento)

## Veredicto: Plano atualizado para v5.50 com 4 achados CRÍTICOS — status 'paid' inglês no webhook tornando pagamentos INVISÍVEIS (#329), status 'overdue' inglês no webhook (#330), confirmação manual 'paid' no cancel-payment-intent (#334), e auth incompatível process-cancellation→create-invoice quebrando TODAS as faturas de cancelamento (#337).

---

## Auditoria de 13ª Passagem (Análise Cruzada Profunda — Webhook Connect, Lifecycle de Pagamento e Cancelamento)

Funções auditadas nesta rodada (13ª passagem — análise cruzada profunda):
- `webhook-stripe-connect/index.ts` (560 linhas) — 'paid' inglês em 3 handlers (#329 ALTA), 'overdue' inglês (#330 ALTA), .single() em 3 lookups (#333), sem status guard (#338)
- `create-invoice/index.ts` (575 linhas) — FK join proibido L148, L228 (#331)
- `create-payment-intent-connect/index.ts` (659 linhas) — 3 FK joins + .single() (#332)
- `cancel-payment-intent/index.ts` (250 linhas) — 'paid' inglês L113, L172 (#334 ALTA)
- `process-cancellation/index.ts` (500 linhas) — .single() L107 (#336), SERVICE_ROLE_KEY como Bearer (#337 ALTA)
- `verify-payment-status/index.ts` (124 linhas) — .single() + IDOR (confirma #195)
- `change-payment-method/index.ts` (253 linhas) — bug .eq() duplicado (confirma #196)
- `send-invoice-notification/index.ts` (465 linhas) — 3× .single() (#335)
- `automated-billing/index.ts` (1057 linhas) — FK joins (confirma #300), sem idempotência mensal (confirma #303)
- `handle-student-overage/index.ts` (238 linhas) — tabela inexistente (confirma memória)

### Achados Críticos (→ Fase 0)

1. **#329 (ALTA — IMPACTO MASSIVO)**: `webhook-stripe-connect` L320, L358, L469 — TODOS os handlers de pagamento bem-sucedido usam `status: 'paid'` (inglês). O sistema usa `'paga'`. NENHUM pagamento Stripe é visível no dashboard.

2. **#330 (ALTA)**: `webhook-stripe-connect` L404 — `invoice.marked_uncollectible` usa `status: 'overdue'` em vez de `'vencida'`.

3. **#334 (ALTA)**: `cancel-payment-intent` L113, L172 — Confirmação manual usa `status: 'paid'` em vez de `'paga'`. Pagamentos manuais invisíveis.

4. **#337 (ALTA — FUNCIONALIDADE QUEBRADA)**: `process-cancellation` L450-457 invoca `create-invoice` com `SERVICE_ROLE_KEY` como Bearer. `create-invoice` rejeita por não ser JWT de usuário. TODAS as faturas de cancelamento falham silenciosamente.

### Achados Médios

5. **#331**: `create-invoice` — FK join proibido L148, L228-241.
6. **#332**: `create-payment-intent-connect` — 3 FK joins aninhados + .single().
7. **#333**: `webhook-stripe-connect` — .single() em lookups por stripe_invoice_id/payment_intent_id → retry storms.
8. **#335**: `send-invoice-notification` — 3× .single() em lookups críticos.
9. **#336**: `process-cancellation` — .single() L107 para dependente.
10. **#338**: `webhook-stripe-connect` — handlers de falha sem status guard, podem reverter status 'paga'.

### Totais Atualizados (v5.50)
- 338 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 10 confirmações
- 308 únicas
- 10 implementadas + 2 confirmações de memória
- **296 pendentes**
- Fase 0: **50 itens** (+4: #329, #330, #334, #337)
- **100% cobertura**: 75 funções auditadas (13 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (50 itens críticos), com destaque para o #329 (pagamentos invisíveis) e #337 (faturas de cancelamento quebradas) que têm impacto imediato em produção. O padrão de status em inglês vs português é sistêmico e afeta webhook-stripe-connect (#329, #330), cancel-payment-intent (#334), check-overdue-invoices (#278), e generate-teacher-notifications (#316).

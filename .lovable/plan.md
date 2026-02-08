



# Plano de Implementação: Cobrança Híbrida Global — Status v3.7

**Documento principal**: `docs/hybrid-billing-implementation-plan.md` (v3.7, 212 gaps corrigidos, 15 pontas soltas resolvidas)

**Status**: ✅ Aprovado — Pronto para Implementação

---

## Resumo Executivo

O plano v3.7 resolve 212 gaps identificados em 25 revisões cruzadas exaustivas entre o documento de implementação e o código-fonte real do projeto.

### Atualizações v3.7 (Gaps 208-212)

| # | Gap | Gravidade | Resolução |
|---|-----|-----------|-----------|
| 208 | Seção 3 (SQL Migration) falta `ALTER TABLE teacher_student_relationships ADD COLUMN stripe_customer_id TEXT` exigido por Gaps 39/62 | Alta | Seção 3.4 adicionada com ALTER TABLE, COMMENT e índice parcial |
| 209 | `automated-billing` não seta `payment_origin` ao criar invoices — UI mostra badges inconsistentes | Média | FIX documentado na Fase 7: setar `payment_origin: 'automated'` |
| 210 | Gap 206 sem code block concreto para taxas PIX/Cartão em `Financeiro.tsx` | Média | Code block e chaves i18n detalhados para Fase 2 |
| 211 | `send-invoice-notification` usa `.single()` para lookups (risco de exceção em cenários de void rápido) | Baixa | FIX: substituir por `.maybeSingle()` com early return — tarefa opcional Fase 7 |
| 212 | `automated-billing` não seta `original_amount` no invoiceData — discrepância com prepaid | Baixa | FIX: adicionar `original_amount: amount` na Fase 7 |

### Fases de Implementação

```
FASE 0: Correções Críticas (webhook existente) — ANTES de tudo
  → Gaps 82, 83, 86, 90, 98, 99, 103-106, 112, 114, 115, 178-181, 183, 189

FASE 1: Migração SQL + i18n + SDK checks (Gaps 190, 197)
  → Inclui atualização de create-payment-intent-connect E webhook-stripe-subscriptions
  → [v3.7] Inclui stripe_customer_id em teacher_student_relationships (Gap 208)
FASE 2: Frontend (BillingSettings + InvoiceTypeBadge + InvoiceStatusBadge + Financeiro + Faturas.tsx)
  → Inclui Gap 204 (InvoiceStatusBadge paymentOrigin 'prepaid') e Gap 206 (fee alert)
  → [v3.7] Inclui Gap 210 (code block concreto para fee breakdown por método)
FASE 3: Backend (process-class-billing)
FASE 4: Integração (Agenda.tsx)
  → Inclui Gap 205 (code block concreto para indicador visual)
FASE 5: Cancelamento (process-cancellation) — inclui voidResult, Stripe init, CORS, JWT validation (Gap 207)
FASE 6: Webhooks (novas features)
FASE 7: Ajustes (automated-billing)
  → [v3.7] Inclui Gap 209 (payment_origin: 'automated'), Gap 212 (original_amount)
  → [v3.7] Inclui Gap 211 (send-invoice-notification .maybeSingle() — opcional)
FASE 8: Testes e Validação
```

### Próximo Passo

Iniciar **Fase 0**: correções críticas no webhook-stripe-connect existente.

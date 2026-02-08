



# Plano de Implementação: Cobrança Híbrida Global — Status v3.9 FINAL

**Documento principal**: `docs/hybrid-billing-implementation-plan.md` (v3.9 FINAL, 225 gaps corrigidos, 15 pontas soltas resolvidas)

**Status**: ✅ APROVADO FINAL — Pronto para Implementação

---

## Resumo Executivo

O plano v3.9 FINAL resolve 225 gaps identificados em 27 revisões cruzadas exaustivas entre o documento de implementação e o código-fonte real do projeto. Esta é a versão final aprovada para implementação.

### Atualizações v3.9 FINAL (Gaps 218-225)

| # | Gap | Gravidade | Resolução |
|---|-----|-----------|-----------|
| 218 | RPC `create_invoice_and_mark_classes_billed` não persiste novos campos | Alta | Verificação obrigatória antes da Fase 7 com query de inspeção |
| 219 | `InvoiceTypeBadge.tsx` mapeia apenas 3 tipos (faltam 4) | Alta | Code block completo com 7 tipos na seção 4.4 |
| 220 | `InvoiceStatusBadge.tsx` não verifica `paymentOrigin === 'prepaid'` | Média | FIX com verificação e ícone/sufixo correspondente |
| 221 | `financial.json` PT sem `paymentOrigin.prepaid` | Média | Chave adicionada ao bloco `paymentOrigin` (singular) |
| 222 | `financial.json` EN sem `paymentOrigin.prepaid` | Média | Chave adicionada ao bloco `paymentOrigin` (singular) |
| 223 | `Financeiro.tsx` usa função inline duplicada em vez de `InvoiceTypeBadge` | Média | Deletar inline e usar componente compartilhado |
| 224 | Alerta de taxas calcula apenas Boleto — falta fee breakdown | Média | Code block com cálculo por método (Boleto/PIX/Cartão/Manual) |
| 225 | `BillingSettings.tsx` não possui card "Momento da Cobrança" | Alta | Implementar código completo da seção 4.1 na Fase 2 |

### Fases de Implementação

```
FASE 0: Correções Críticas (webhook existente) — ANTES de tudo
  → Gaps 82, 83, 86, 90, 98, 99, 103-106, 112, 114, 115, 178-181, 183, 189

FASE 1: Migração SQL + i18n + SDK checks (Gaps 190, 197)
  → Inclui atualização de create-payment-intent-connect E webhook-stripe-subscriptions
  → [v3.7] Inclui stripe_customer_id em teacher_student_relationships (Gap 208)
  → [v3.9] Inclui chaves i18n paymentOrigin.prepaid PT/EN (Gaps 221, 222)

FASE 2: Frontend (BillingSettings + InvoiceTypeBadge + InvoiceStatusBadge + Financeiro + Faturas.tsx)
  → Inclui Gap 204 (InvoiceStatusBadge paymentOrigin 'prepaid') e Gap 206 (fee alert)
  → [v3.7] Inclui Gap 210 (code block concreto para fee breakdown por método)
  → [v3.8] Inclui Gap 213 (i18n merge refinado), Gap 216 (fallback manual), Gap 217 (prepaid i18n PT/EN)
  → [v3.9] Inclui Gaps 219-220 (InvoiceTypeBadge 7 tipos, InvoiceStatusBadge prepaid check)
  → [v3.9] Inclui Gap 223 (Financeiro.tsx usar componente compartilhado)
  → [v3.9] Inclui Gap 224 (fee breakdown por método de pagamento)
  → [v3.9] Inclui Gap 225 (BillingSettings card "Momento da Cobrança")

FASE 3: Backend (process-class-billing)

FASE 4: Integração (Agenda.tsx)
  → Inclui Gap 205 (code block concreto para indicador visual)
  → [v3.8] Inclui Gap 214 (toast de erro na materialização)

FASE 5: Cancelamento (process-cancellation) — inclui voidResult, Stripe init, CORS, JWT validation (Gap 207)

FASE 6: Webhooks (novas features)

FASE 7: Ajustes (automated-billing)
  → [v3.7] Inclui Gap 209 (payment_origin: 'automated'), Gap 212 (original_amount)
  → [v3.7] Inclui Gap 211 (send-invoice-notification .maybeSingle() — opcional)
  → [v3.8] Inclui Gap 215 (verificar RPC antes do FIX)
  → [v3.9] Inclui Gap 218 (verificar/corrigir RPC create_invoice_and_mark_classes_billed)

FASE 8: Testes e Validação
```

### Próximo Passo

Iniciar **Fase 0**: correções críticas no webhook-stripe-connect existente.

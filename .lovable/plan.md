



# Plano de Implementação: Cobrança Híbrida Global — Status v3.8 FINAL

**Documento principal**: `docs/hybrid-billing-implementation-plan.md` (v3.8 FINAL, 217 gaps corrigidos, 15 pontas soltas resolvidas)

**Status**: ✅ APROVADO FINAL — Pronto para Implementação

---

## Resumo Executivo

O plano v3.8 FINAL resolve 217 gaps identificados em 26 revisões cruzadas exaustivas entre o documento de implementação e o código-fonte real do projeto. Esta é a versão final aprovada para implementação.

### Atualizações v3.8 FINAL (Gaps 213-217)

| # | Gap | Gravidade | Resolução |
|---|-----|-----------|-----------|
| 213 | Seção 6.3 (i18n) propõe chaves que já existem — merge incorreto | Média | Instrução refinada: adicionar APENAS `prepaidClass` ao bloco `invoiceTypes` existente |
| 214 | Materialização sem toast de erro quando billing falha | Baixa | Toast de erro + chave i18n `billingError` adicionados à seção 4.2.2 |
| 215 | RPC `create_invoice_and_mark_classes_billed` pode não persistir `payment_origin`/`original_amount` | Média | Query de verificação adicionada à Fase 7 antes do FIX |
| 216 | Fee breakdown ignora faturas com `payment_method = null` | Baixa | Fallback para categoria "manual" com taxa R$ 0,00 |
| 217 | Chave `paymentOrigin.prepaid` faltando em ambos PT e EN | Baixa | Adicionada verificação cruzada e instruções para ambos arquivos |

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
  → [v3.8] Inclui Gap 213 (i18n merge refinado), Gap 216 (fallback manual), Gap 217 (prepaid i18n PT/EN)

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

FASE 8: Testes e Validação
```

### Próximo Passo

Iniciar **Fase 0**: correções críticas no webhook-stripe-connect existente.

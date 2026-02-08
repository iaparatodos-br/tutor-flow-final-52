

# Plano v3.10 FINAL — 228 Gaps Corrigidos — ENCERRADO

## Status: ✅ APROVADO FINAL — Pronto para Fase 0

Documento completo: `docs/hybrid-billing-implementation-plan.md` (v3.10 FINAL)

## Resumo

228 gaps identificados e documentados ao longo de 10 revisões incrementais (v3.1 a v3.10).
Todas as inconsistências entre o documento de implementação e o código real foram resolvidas.

## Últimos Gaps (226-228)

| # | Gap | Gravidade | Fase |
|---|-----|-----------|------|
| 226 | Financeiro.tsx loadInvoices não inclui payment_method | Média | 2 |
| 227 | Financeiro.tsx getStatusBadge inline não usa InvoiceStatusBadge | Média | 2 |
| 228 | RPC create_invoice_and_mark_classes_billed sem SQL concreto | Alta | 7 |

## Sequência de Implementação

| Fase | Descrição | Gaps Principais |
|------|-----------|-----------------|
| 0 | Correções críticas no webhook existente (.maybeSingle(), payment_origin, event.account) | 100, 181, 198 |
| 1 | Migração SQL + i18n (charge_timing, stripe_customer_id, chaves prepaid) | 208, 221, 222 |
| 2 | Frontend (BillingSettings toggle, InvoiceTypeBadge 7 tipos, InvoiceStatusBadge prepaid, Financeiro refactor) | 219, 220, 223, 224, 225, 226, 227 |
| 3 | Edge Function process-class-billing (nova) | Core feature |
| 4 | Integração frontend (Agenda.tsx, ClassForm.tsx) | 205 |
| 5 | process-cancellation (void de faturas pré-pagas) | 198, 200, 202, 207 |
| 6 | Webhook invoice.paid (handleInvoicePaidEvent) | 203 |
| 7 | Ajustes automated-billing + RPC | 209, 212, 228 (pré-requisito) |
| 8 | Testes e validação | — |

## Próximo Passo

Iniciar **Fase 0**: correções críticas no webhook `webhook-stripe-connect`.

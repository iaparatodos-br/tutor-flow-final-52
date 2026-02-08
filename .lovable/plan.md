
# Plano v3.10 FINAL ENCERRADO — 228 Gaps — Pronto para Fase 0

## Status: ✅ ENCERRADO — Revisão final concluída

Documento completo: `docs/hybrid-billing-implementation-plan.md` (v3.10 FINAL ENCERRADO)

Todas as 2937 linhas do documento foram cruzadas com os arquivos reais do codebase.
Seções 1-13 + Apêndices A-D verificadas. Nenhum gap adicional encontrado.

## Resultado da Revisão Final

- **228 gaps** identificados e documentados (v3.1 a v3.10)
- **15 pontas soltas** resolvidas
- **Seções 11 (sequência), 12 (arquivos), 13 (checklist)** atualizadas com referências aos Gaps 226-228
- Interface `InvoiceWithStudent.status` deve incluir `falha_pagamento` — documentado como sub-item do Gap 227

## Sequência de Implementação

| Fase | Descrição | Gaps Principais |
|------|-----------|-----------------|
| 0 | Correções críticas no webhook existente | 82, 83, 86, 90, 98, 99, 103-106, 114, 115, 178-181 |
| 1 | Migração SQL + i18n + SDK updates | 208, 221, 222, 190, 197 |
| 2 | Frontend (BillingSettings, InvoiceTypeBadge 7 tipos, InvoiceStatusBadge prepaid, Financeiro refactor completo) | 219, 220, 223-227 |
| 3 | Edge Function process-class-billing (nova) | Core feature |
| 4 | Integração frontend (Agenda.tsx) | 205 |
| 5 | process-cancellation (void de faturas pré-pagas) | 198, 200, 202, 207 |
| 6 | Webhook invoice.paid (handleInvoicePaidEvent) | 203 |
| 7 | Ajustes automated-billing + RPC (Gap 228 é pré-requisito) | 209, 212, 228 |
| 8 | Testes e validação | — |

## Próximo Passo

Iniciar **Fase 0**: correções críticas no webhook `webhook-stripe-connect`.

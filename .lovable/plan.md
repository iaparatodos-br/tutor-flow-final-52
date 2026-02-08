

# Plano de Implementação: Cobrança Híbrida Global — Status v3.3

**Documento principal**: `docs/hybrid-billing-implementation-plan.md` (v3.3, 192 gaps corrigidos, 15 pontas soltas resolvidas)

**Status**: ✅ Aprovado — Pronto para Implementação

---

## Resumo Executivo

O plano v3.3 resolve 192 gaps identificados em 17 revisões cruzadas exaustivas entre o documento de implementação e o código-fonte real do projeto.

### Atualizações v3.3 (Gaps 184-192)

| # | Gap | Gravidade | Resolução |
|---|-----|-----------|-----------|
| 184 | `invoice.voided` incorretamente descrito como Gap 82 | Baixa | Descrição corrigida — usa pattern Gap 67 (if/else) |
| 185 | `handleInvoicePaidEvent` params redundantes | Baixa | Signature simplificada (4 params em vez de 7) |
| 186 | InvoiceTypeBadge sem tipo `regular` | Média | Tipo `regular` adicionado à seção 4.4 |
| 187 | Gap 114 duplicado na Fase 0 e Fase 5 | Baixa | Removido da Fase 5 |
| 188 | Sem doc do failsafe prepaid → automated | Baixa | Nota adicionada à seção 9 |
| 189 | `validateStripeEvent` sem `invoice.finalized` | Média | Gap 112 adicionado à Fase 0 |
| 190 | SDK update na fase errada | Baixa | Gap 74 movido para Fase 1 |
| 191 | Override de `paymentMethods` no ponto errado | Alta | Ponto de inserção corrigido (após linha 308) |
| 192 | `completeEventProcessing(true)` sobrescreve falha | Alta | Return Response no catch em vez de null |

### Fases de Implementação

```
FASE 0: Correções Críticas (webhook existente) — ANTES de tudo
  → Gaps 82, 83, 86, 90, 98, 99, 103-106, 112, 114, 115, 178-181, 183, 189

FASE 1: Migração SQL + i18n + SDK check (Gap 190)
FASE 2: Frontend (BillingSettings + InvoiceTypeBadge + Financeiro)
FASE 3: Backend (process-class-billing)
FASE 4: Integração (Agenda.tsx)
FASE 5: Cancelamento (process-cancellation)
FASE 6: Webhooks (novas features)
FASE 7: Ajustes (automated-billing)
FASE 8: Testes e Validação
```

### Próximo Passo

Iniciar **Fase 0**: correções críticas no webhook-stripe-connect existente.

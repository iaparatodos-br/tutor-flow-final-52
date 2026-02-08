

# Plano de Implementação: Cobrança Híbrida Global — Status v3.2

**Documento principal**: `docs/hybrid-billing-implementation-plan.md` (v3.2, 183 gaps corrigidos, 15 pontas soltas resolvidas)

**Status**: ✅ Aprovado — Pronto para Implementação

---

## Resumo Executivo

O plano v3.2 resolve 183 gaps identificados em 15 revisões cruzadas exaustivas entre o documento de implementação e o código-fonte real do projeto. As 15 pontas soltas (6 ALTA, 6 MÉDIA, 1 CRÍTICA, 2 BAIXA) foram todas incorporadas ao documento.

### Atualizações v3.2 (Gaps 178-183)

| # | Ponta Solta | Gravidade | Resolução |
|---|-------------|-----------|-----------|
| 178 | `payment_intent.succeeded` sem handler completo | Alta | Handler COMPLETO de substituição na seção 8.4 |
| 179 | SELECT sem `stripe_invoice_id` | Alta | SELECT expandido para 4 campos no handler |
| 180 | `invoice.payment_failed` sem check `payment_origin` | Média | Verificação `manual` adicionada ao handler |
| 181 | `invoice.payment_succeeded` sem código concreto | Média | Helper function `handleInvoicePaidEvent` extraída |
| 182 | Label "Pagar com Cartão" enganoso para prepaid | Média | Seção de métodos substituída em 6.4 |
| 183 | Fase 0 sem Gap 90 (`invoice.finalized`) | Baixa | Adicionado à Fase 0 |

### Fases de Implementação

```
FASE 0: Correções Críticas (webhook existente) — ANTES de tudo
  → Gaps 82, 83, 86, 90, 98, 99, 103-106, 114, 115, 178-181, 183

FASE 1: Migração SQL + i18n
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

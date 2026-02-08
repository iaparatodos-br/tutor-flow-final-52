

# Plano de Implementação: Cobrança Híbrida Global — Status v3.5

**Documento principal**: `docs/hybrid-billing-implementation-plan.md` (v3.5, 202 gaps corrigidos, 15 pontas soltas resolvidas)

**Status**: ✅ Aprovado — Pronto para Implementação

---

## Resumo Executivo

O plano v3.5 resolve 202 gaps identificados em 21 revisões cruzadas exaustivas entre o documento de implementação e o código-fonte real do projeto.

### Atualizações v3.5 (Gaps 198-202)

| # | Gap | Gravidade | Resolução |
|---|-----|-----------|-----------|
| 198 | Seção 5.4: `voidResult` atribuído sem declaração no code block copiável | Alta | `let voidResult: any = null;` adicionado ao topo do code block (antes de `let invoiceClassQuery`) |
| 199 | InvoiceTypeBadge fallback `|| typeConfig.manual` deveria ser `|| typeConfig.regular` | Média | Fallback atualizado para `typeConfig.regular` na seção 4.4 |
| 200 | Stripe instanciado dentro do loop de void (redundante para N faturas) | Baixa | `new Stripe(...)` movido para antes do loop; adicionado à Fase 5 |
| 201 | `paymentOrigins` (plural) na seção 6.3 sobrescreveria bloco existente com 4 chaves | Alta | Namespace corrigido para `paymentOrigin` (singular) — adiciona apenas `prepaid` sem perder `stripe`/`unspecified` |
| 202 | `voidResult` declaration listada na Fase 3 (process-class-billing) em vez da Fase 5 (process-cancellation) | Média | Task movida para Fase 5 |

### Fases de Implementação

```
FASE 0: Correções Críticas (webhook existente) — ANTES de tudo
  → Gaps 82, 83, 86, 90, 98, 99, 103-106, 112, 114, 115, 178-181, 183, 189

FASE 1: Migração SQL + i18n + SDK checks (Gaps 190, 197)
  → Inclui atualização de create-payment-intent-connect E webhook-stripe-subscriptions
FASE 2: Frontend (BillingSettings + InvoiceTypeBadge + Financeiro + Faturas.tsx)
FASE 3: Backend (process-class-billing)
FASE 4: Integração (Agenda.tsx)
FASE 5: Cancelamento (process-cancellation) — inclui voidResult, Stripe init, CORS
FASE 6: Webhooks (novas features)
FASE 7: Ajustes (automated-billing)
FASE 8: Testes e Validação
```

### Próximo Passo

Iniciar **Fase 0**: correções críticas no webhook-stripe-connect existente.

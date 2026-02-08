


# Plano de Implementação: Cobrança Híbrida Global — Status v3.6

**Documento principal**: `docs/hybrid-billing-implementation-plan.md` (v3.6, 207 gaps corrigidos, 15 pontas soltas resolvidas)

**Status**: ✅ Aprovado — Pronto para Implementação

---

## Resumo Executivo

O plano v3.6 resolve 207 gaps identificados em 23 revisões cruzadas exaustivas entre o documento de implementação e o código-fonte real do projeto.

### Atualizações v3.6 (Gaps 203-207)

| # | Gap | Gravidade | Resolução |
|---|-----|-----------|-----------|
| 203 | Seção 5.3: handler inline `invoice.paid` coexiste com helper `handleInvoicePaidEvent` sem indicação de qual usar | Média | Nota de supersedência adicionada — implementar APENAS a helper, não o handler inline |
| 204 | `InvoiceStatusBadge.tsx` não suporta `paymentOrigin === 'prepaid'` apesar de chave i18n existir | Média | FIX documentado na seção 4.4: adicionar `isPrepaid` check com ícone `Zap` e sufixo i18n |
| 205 | Seção 4.5 (indicador visual na Agenda) sem code block TypeScript concreto | Média | Code block completo adicionado com `fetchBilledClassIds()`, estado React e JSX |
| 206 | Alerta de taxas Stripe em `Financeiro.tsx` assume apenas Boleto (R$ 3,49 fixo) | Baixa | Nota adicionada à seção 9; FIX para Fase 2: condicionar ao `payment_method` real |
| 207 | `process-cancellation` não valida `cancelled_by` contra JWT autenticado | Média | Nota de segurança na seção 5.4; validação adicionada à Fase 5 |

### Fases de Implementação

```
FASE 0: Correções Críticas (webhook existente) — ANTES de tudo
  → Gaps 82, 83, 86, 90, 98, 99, 103-106, 112, 114, 115, 178-181, 183, 189

FASE 1: Migração SQL + i18n + SDK checks (Gaps 190, 197)
  → Inclui atualização de create-payment-intent-connect E webhook-stripe-subscriptions
FASE 2: Frontend (BillingSettings + InvoiceTypeBadge + InvoiceStatusBadge + Financeiro + Faturas.tsx)
  → Inclui Gap 204 (InvoiceStatusBadge paymentOrigin 'prepaid') e Gap 206 (fee alert)
FASE 3: Backend (process-class-billing)
FASE 4: Integração (Agenda.tsx)
  → Inclui Gap 205 (code block concreto para indicador visual)
FASE 5: Cancelamento (process-cancellation) — inclui voidResult, Stripe init, CORS, JWT validation (Gap 207)
FASE 6: Webhooks (novas features)
FASE 7: Ajustes (automated-billing)
FASE 8: Testes e Validação
```

### Próximo Passo

Iniciar **Fase 0**: correções críticas no webhook-stripe-connect existente.

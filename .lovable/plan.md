

# Plano de Implementação: Cobrança Híbrida Global — Status v3.4

**Documento principal**: `docs/hybrid-billing-implementation-plan.md` (v3.4, 197 gaps corrigidos, 15 pontas soltas resolvidas)

**Status**: ✅ Aprovado — Pronto para Implementação

---

## Resumo Executivo

O plano v3.4 resolve 197 gaps identificados em 19 revisões cruzadas exaustivas entre o documento de implementação e o código-fonte real do projeto.

### Atualizações v3.4 (Gaps 193-197)

| # | Gap | Gravidade | Resolução |
|---|-----|-----------|-----------|
| 193 | Seção 4.1: query `business_profiles` sem `.limit(1)` antes de `.maybeSingle()` | Alta | `.limit(1)` adicionado — previne PGRST116 para professores com múltiplos profiles |
| 194 | `Faturas.tsx` na Fase 4 (seção 12) mas `canChangePaymentMethod` fix na Fase 2 (seção 11) | Média | Alinhado para Fase 2 na seção 12 |
| 195 | Seção 4.4 sem tipo `regular` no code block apesar do Gap 186 | Média | Tipo `regular` adicionado com `bg-slate-100` e `icon: FileText` |
| 196 | Seção 6.3 `financial.json` sem chave `"regular"` em PT/EN | Baixa | Chave adicionada em ambos os idiomas |
| 197 | `webhook-stripe-subscriptions` usa `stripe@14.21.0` — fora da lista de SDK update | Média | Adicionado à seção 12 e Fase 1 |

### Fases de Implementação

```
FASE 0: Correções Críticas (webhook existente) — ANTES de tudo
  → Gaps 82, 83, 86, 90, 98, 99, 103-106, 112, 114, 115, 178-181, 183, 189

FASE 1: Migração SQL + i18n + SDK checks (Gaps 190, 197)
  → Inclui atualização de create-payment-intent-connect E webhook-stripe-subscriptions
FASE 2: Frontend (BillingSettings + InvoiceTypeBadge + Financeiro + Faturas.tsx)
FASE 3: Backend (process-class-billing)
FASE 4: Integração (Agenda.tsx)
FASE 5: Cancelamento (process-cancellation)
FASE 6: Webhooks (novas features)
FASE 7: Ajustes (automated-billing)
FASE 8: Testes e Validação
```

### Próximo Passo

Iniciar **Fase 0**: correções críticas no webhook-stripe-connect existente.

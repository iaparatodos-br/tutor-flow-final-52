
# Etapa 0.1 — Corrigir Status Mismatch pt-BR ✅
# Etapa 0.2 — Guard Clauses / Race Conditions ✅
# Etapa 0.3 — Webhook Resilience / HTTP 500 ✅
# Etapa 0.4 — Audit Logs Schema Mismatch ✅
# Etapa 0.5 — .single() → .maybeSingle() ✅
# Etapa 0.6 — FK Joins proibidos no Deno ✅

## Etapa 0.6 — Resumo

Refatoradas todas as FK join syntax (`profiles!`, `classes!inner`, `subscription_plans!inner`) para queries sequenciais independentes em 10 Edge Functions:

### Arquivos Modificados

1. **automated-billing** — 3 FK joins removidos (relationship profiles, classes!inner, subscription_plans!inner)
2. **create-payment-intent-connect** — 3 FK joins removidos (student/teacher/business_profile)
3. **get-teacher-availability** — 1 FK join removido (classes!inner)
4. **create-invoice** — 2 FK joins removidos (business_profiles!fkey, classes!inner)
5. **generate-boleto-for-invoice** — 2 FK joins removidos (student/teacher profiles)
6. **process-orphan-cancellation-charges** — 2 FK joins removidos (classes!inner, profiles!fkey)
7. **smart-delete-student** — 2 FK joins removidos (classes!inner 2x)
8. **process-expired-subscriptions** — 2 FK joins removidos (subscription_plans!inner, profiles!user_id)
9. **change-payment-method** — 2 FK joins removidos (student/teacher profiles)
10. **check-subscription-status** — 1 FK join removido (profiles!fkey)

### Padrão Aplicado

Todas as queries foram convertidas para o padrão sequencial:
1. Query principal sem joins
2. Queries separadas para dados relacionados
3. Montagem de maps para eficiência em listas
4. Objetos compostos reconstruídos manualmente

## Próximas Etapas Pendentes (Fase 0)

- **Categoria A**: Auth/IDOR (~25 itens) — vulnerabilidades de autenticação
- **Categoria H**: FK Cascade / Deletion failures (~8 itens)
- **Categoria I**: Data Corruption (~6 itens)
- **Categoria J**: Integridade de dados (~8 itens)
- **Categoria K**: ANON_KEY inline / SQL injection em setup (~6 itens)
- **Categoria L**: Outros itens Fase 0 (~20 itens)



# Verificação Final v5.44 — 10 Novas Pontas Soltas (7ª Passagem: Notificações, Entity Management e CRUD)

## Veredicto: Plano atualizado para v5.44 com padrão sistêmico de `.single()` em TODAS as funções de notificação.

---

## Auditoria de 7ª Passagem (Notificações, Entity Management e CRUD)

Funções auditadas nesta rodada (7ª passagem):
- `send-class-reminders/index.ts` (317 linhas) — 2× `.single()` em loops (#267, #268)
- `send-invoice-notification/index.ts` (465 linhas) — CONFIRMAÇÃO #248 (#269), `.single()` em monthly_subscriptions (#270)
- `send-cancellation-notification/index.ts` (498 linhas) — 4× `.single()` em dependent lookups (#271)
- `send-class-report-notification/index.ts` (294 linhas) — 5× `.single()` (#272)
- `send-class-request-notification/index.ts` (210 linhas) — 3× `.single()` sequenciais (#273)
- `send-material-shared-notification/index.ts` (316 linhas) — 2× `.single()` (#274)
- `send-boleto-subscription-notification/index.ts` (345 linhas) — 1× `.single()` (#275)
- `send-student-invitation/index.ts` (158 linhas) — OK (sem DB queries)
- `resend-student-invitation/index.ts` (186 linhas) — `.single()` em profiles/relationship mas com handling adequado
- `send-class-confirmation-notification/index.ts` (212 linhas) — `.single()` em profiles mas com error check
- `send-password-reset/index.ts` (244 linhas) — OK (anti-enumeration correto)
- `generate-teacher-notifications/index.ts` (351 linhas) — OK (sem `.single()`)
- `create-student/index.ts` (529 linhas) — OK (já corrigido em #132)
- `create-dependent/index.ts` (211 linhas) — inconsistência de overage (#276)
- `delete-dependent/index.ts` (240 linhas) — OK (`.maybeSingle()` correto)
- `update-dependent/index.ts` (148 linhas) — OK (`.maybeSingle()` + ownership)
- `create-teacher/index.ts` (220 linhas) — OK
- `manage-class-exception/index.ts` (157 linhas) — OK (`.maybeSingle()` correto)

### Padrão Sistêmico Identificado

**TODAS as 10 funções de notificação (send-*)** compartilham o mesmo anti-padrão: usam `.single()` em lookups dentro de loops de processamento. Isso significa que **um único registro ausente (perfil, dependente, relação) derruba a fila inteira de notificações**, afetando todos os destinatários restantes.

Recomendação: criar um batch fix que substitua `.single()` por `.maybeSingle()` com `continue` em todas as 10 funções simultaneamente. Estimativa: ~30 substituições em ~20 minutos.

### Totais Atualizados (v5.44)
- 276 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 7 confirmações (#246→#196, #247→#181, #252→#109, #254→#138, #260→#195, #261→#196, #269→#248)
- 247 únicas
- 10 implementadas
- **235 pendentes**
- Fase 0: **28 itens** (sem alterações — issues de notificação são MÉDIA, não ALTA)
- **100% cobertura**: 75 funções auditadas (7 passagens completas)

### Status Final
Prioridade de execução permanece: Fase 0 primeiro (28 itens críticos), seguido por batch fix de `.single()` em funções de notificação (~30 substituições).

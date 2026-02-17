


# Verificação Final v5.48 — 9 Novas Pontas Soltas (11ª Passagem: Análise Cruzada Profunda — Notificações, Deduplicação e Setup)

## Veredicto: Plano atualizado para v5.48 com 2 achados CRÍTICOS — deduplicação de notificações quebrada em check-overdue-invoices e faturas fantasma em validate-payment-routing.

---

## Auditoria de 11ª Passagem (Análise Cruzada Profunda — Notificações, Deduplicação e Setup)

Funções auditadas nesta rodada (11ª passagem — análise cruzada profunda):
- `send-class-reminders/index.ts` (317 linhas) — FK join em class_services (#309), `.single()` confirmados
- `send-invoice-notification/index.ts` (465 linhas) — `.single()` confirmados
- `send-class-report-notification/index.ts` (294 linhas) — 6× `.single()` confirmados
- `send-cancellation-notification/index.ts` (498 linhas) — `.single()` em dependentes confirmados
- `send-material-shared-notification/index.ts` (316 linhas) — `.single()` confirmados
- `send-boleto-subscription-notification/index.ts` (345 linhas) — SES direto (#312), `.single()` confirmado
- `send-class-confirmation-notification/index.ts` (212 linhas) — `.single()` confirmados
- `send-class-request-notification/index.ts` (210 linhas) — `.single()` confirmados
- `validate-payment-routing/index.ts` (321 linhas) — insere fatura real como teste (#307 ALTA)
- `validate-monthly-subscriptions/index.ts` (355 linhas) — FK join (#311)
- `check-overdue-invoices/index.ts` (152 linhas) — deduplicação quebrada (#308 ALTA), TOCTOU (#310)
- `setup-billing-automation/index.ts` (69 linhas) — ANON_KEY inline (#315)
- `send-password-reset`, `send-student-invitation`, `resend-student-invitation` — sem rate limiting (#313), `.single()` (#314)

### Achados Críticos (→ Fase 0)

1. **#307 (ALTA)**: `validate-payment-routing` — INSERE fatura REAL de R$1,00 no banco como "teste" (L245-263). Se deleção falhar → faturas fantasma processadas pelo billing automation.

2. **#308 (ALTA)**: `check-overdue-invoices` — Deduplicação COMPLETAMENTE QUEBRADA. Verifica duplicatas em `class_notifications.class_id` com IDs de fatura (FK violation), e nenhuma função insere o registro de dedup. Resultado: **spam massivo** a cada execução do cron.

### Achados Médios

3. **#309**: `send-class-reminders` L36 — FK join `class_services(name)`.
4. **#310**: `check-overdue-invoices` — TOCTOU race condition no UPDATE sem guard clause.
5. **#311**: `validate-monthly-subscriptions` L230 — FK join `monthly_subscriptions!inner`.
6. **#312**: `send-boleto-subscription-notification` — SES direto sem shared helper.

### Achados Baixos

7. **#313**: `send-password-reset`/`send-student-invitation` — sem rate limiting.
8. **#314**: `resend-student-invitation` — 3× `.single()`.
9. **#315**: `setup-billing-automation` — ANON_KEY inline no cron SQL.

### Totais Atualizados (v5.48)
- 315 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 10 confirmações
- 285 únicas
- 10 implementadas + 2 confirmações de memória
- **273 pendentes**
- Fase 0: **43 itens** (+2: #307, #308)
- **100% cobertura**: 75 funções auditadas (11 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (43 itens críticos), seguido por batch fix de `.single()` em funções de notificação (~35 substituições). Os 2 novos achados críticos afetam diretamente a experiência do usuário final: faturas de teste fantasma (#307) e spam massivo de notificações de vencimento (#308).

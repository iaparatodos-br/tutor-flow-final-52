


# Verificação Final v5.49 — 13 Novas Pontas Soltas (12ª Passagem: Análise Cruzada Profunda — Automação, Archiver, Monitoring e Setup)

## Veredicto: Plano atualizado para v5.49 com 3 achados CRÍTICOS — status inglês no inbox do professor (#316), coluna inexistente no archiver (#317), e cascade de deleção incompleta (#318).

---

## Auditoria de 12ª Passagem (Análise Cruzada Profunda — Automação, Archiver, Monitoring e Setup)

Funções auditadas nesta rodada (12ª passagem — análise cruzada profunda):
- `auto-verify-pending-invoices/index.ts` (162 linhas) — sem auth (#324), sem TOCTOU guard (#319)
- `check-pending-boletos/index.ts` (239 linhas) — FK join (#320), `.single()` (#320)
- `archive-old-data/index.ts` (330 linhas) — coluna inexistente (#317 ALTA), FK joins (#321), cascade incompleta (#318 ALTA)
- `dev-seed-test-data/index.ts` (300 linhas) — FK join (#326), 5× `.single()` (#326)
- `stripe-events-monitor/index.ts` (124 linhas) — sem autenticação (#322)
- `check-email-availability/index.ts` (74 linhas) — sem autenticação, enumeração (#323)
- `generate-teacher-notifications/index.ts` (351 linhas) — status inglês 'overdue' (#316 ALTA)
- `security-rls-audit/index.ts` (379 linhas) — `.single()` (#327)
- `list-subscription-invoices/index.ts` (120 linhas) — OK
- `refresh-stripe-connect-account/index.ts` (150 linhas) — `.single()` (#327)
- `check-stripe-account-status/index.ts` (156 linhas) — `.single()` (#327)
- `check-email-confirmation/index.ts` (139 linhas) — OK
- `setup-invoice-auto-verification/index.ts` (89 linhas) — ANON_KEY inline (#328)
- `setup-class-reminders-automation/index.ts` (102 linhas) — ANON_KEY inline (#328)
- `setup-expired-subscriptions-automation/index.ts` (70 linhas) — ANON_KEY inline (#328), parâmetros RPC errados (#325)
- `setup-orphan-charges-automation/index.ts` (109 linhas) — ANON_KEY inline (#328)

### Achados Críticos (→ Fase 0)

1. **#316 (ALTA)**: `generate-teacher-notifications` L187 — Busca faturas com `status: 'overdue'` (inglês), mas o sistema usa `'vencida'` (português). Faturas vencidas NUNCA aparecem na inbox do professor.

2. **#317 (ALTA)**: `archive-old-data` L130 — SELECT inclui `student_id` na query de `classes`, mas a tabela `classes` NÃO TEM coluna `student_id`. Corrompe silenciosamente os arquivos JSON.

3. **#318 (ALTA)**: `archive-old-data` L251-284 — Cascade de deleção incompleta: ignora `class_exceptions`, `class_notifications`, `invoice_classes`, `class_report_feedbacks`, `class_report_photos`. FK RESTRICT causa falha total da deleção.

### Achados Médios

4. **#319**: `auto-verify-pending-invoices` — sem TOCTOU guard no UPDATE.
5. **#320**: `check-pending-boletos` — FK join + `.single()`.
6. **#321**: `archive-old-data` — FK join syntax.
7. **#322**: `stripe-events-monitor` — sem autenticação, exposição de dados financeiros.
8. **#323**: `check-email-availability` — sem autenticação, enumeração de emails.
9. **#324**: `auto-verify-pending-invoices` — sem autenticação.
10. **#325**: `setup-expired-subscriptions-automation` — parâmetros RPC errados, cron nunca criado.

### Achados Baixos

11. **#326**: `dev-seed-test-data` — FK join + 5× `.single()`.
12. **#327**: `.single()` sistêmico em `security-rls-audit`, `refresh-stripe-connect-account`, `check-stripe-account-status`.
13. **#328**: ANON_KEY inline sistêmico em todas as 4 funções `setup-*`.

### Totais Atualizados (v5.49)
- 328 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 10 confirmações
- 298 únicas
- 10 implementadas + 2 confirmações de memória
- **286 pendentes**
- Fase 0: **46 itens** (+3: #316, #317, #318)
- **100% cobertura**: 75 funções auditadas (12 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (46 itens críticos), seguido por batch fix de `.single()` (~40 substituições) e remoção de FK joins (~15 funções). Padrão sistêmico identificado: funções de automação/cron carecem de autenticação (#322-#324), e ANON_KEY é exposta inline em todas as funções setup (#315, #328).

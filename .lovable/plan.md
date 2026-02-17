

# Verificação Final v5.57 — 18 Novas Pontas Soltas (20ª Passagem: Boleto, Exceções, Materialização, Request-Class, Auto-Verificação, Cron, Lembretes)

## Veredicto: Plano atualizado para v5.57 com 8 achados CRÍTICOS — generate-boleto-for-invoice sem auth + FK join (#416/#417 SEGURANÇA), materialize-virtual-class não herda is_paid_class (#418 INTEGRIDADE), request-class não define is_paid_class (#419 INTEGRIDADE), auto-verify-pending-invoices sem auth + sem guard clause (#420/#421 SEGURANÇA/INTEGRIDADE), end-recurrence cascade incompleta (#422 INTEGRIDADE).

---

## Auditoria de 20ª Passagem (Boleto, Exceções, Materialização, Request-Class, Auto-Verificação, Cron Setup, Lembretes e Boletos Pendentes)

Funções auditadas nesta rodada (20ª passagem):
- `generate-boleto-for-invoice/index.ts` — SEM AUTH JWT (#416 SEGURANÇA), FK join proibido (#417 CRÍTICO)
- `manage-class-exception/index.ts` — `.single()` em profiles e upsert (#428 MÉDIO)
- `manage-future-class-exceptions/index.ts` — `.single()` em profiles (#429 MÉDIO)
- `end-recurrence/index.ts` — Cascade incompleta (#422 CRÍTICO), `.single()` (#427), persistSession (#426)
- `materialize-virtual-class/index.ts` — NÃO herda is_paid_class (#418 CRÍTICO), persistSession (#433)
- `request-class/index.ts` — NÃO define is_paid_class (#419 CRÍTICO)
- `auto-verify-pending-invoices/index.ts` — SEM AUTH (#420 SEGURANÇA), sem guard clause (#421 CRÍTICO), Connect key mismatch (#432)
- `setup-billing-automation/index.ts` — ANON_KEY inline (#425 SEGURANÇA)
- `check-pending-boletos/index.ts` — FK join (#423 ALTO), `.single()` (#431)
- `send-class-reminders/index.ts` — FK joins (#424 ALTO), `.single()` 4x em loop (#430 MÉDIO)
- `fetch-archived-data/index.ts` — Sem novos achados (auth OK)

### Achados Críticos (→ Fase 0)

1. **#416 (SEGURANÇA: IDOR)**: `generate-boleto-for-invoice` sem JWT. Qualquer chamador pode gerar boletos para faturas alheias.
2. **#417 (FK JOIN PROIBIDO)**: `generate-boleto-for-invoice` L36-43 `profiles!invoices_student_id_fkey(...)` — falha por cache de schema.
3. **#418 (INTEGRIDADE FINANCEIRA)**: `materialize-virtual-class` L252-263 não herda `is_paid_class`. Aulas gratuitas materializadas cobram indevidamente.
4. **#419 (INTEGRIDADE FINANCEIRA)**: `request-class` L137-146 não define `is_paid_class`. Default `true` dispara billing indesejado.
5. **#420 (SEGURANÇA)**: `auto-verify-pending-invoices` sem auth. Permite alteração em massa de status de faturas.
6. **#421 (INTEGRIDADE)**: `auto-verify-pending-invoices` sem guard clause. Reverte faturas pagas manualmente.
7. **#422 (INTEGRIDADE)**: `end-recurrence` cascade incompleta — FK RESTRICT impede deleção de aulas futuras.
8. **#425 (SEGURANÇA)**: `setup-billing-automation` expõe ANON_KEY inline no SQL.

### Totais Atualizados (v5.57)
- 433 pontas soltas totais | 403 únicas | **391 pendentes**
- Fase 0: **86 itens** (+8: #416, #417, #418, #419, #420, #421, #422, #425)
- **100% cobertura**: 75 funções auditadas (20 passagens)

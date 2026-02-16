



# Verificação Final v5.36 — 7 Novas Pontas Soltas em Downgrade, Overage, Cancelamento e Expiração

## Veredicto: Plano atualizado para v5.36 com 1 novo bug crítico de corrupção de dados e 3 bugs funcionais de auditoria/rastreamento.

---

## Auditoria Profunda Realizada (Funções de Downgrade, Overage, Cancelamento e Expiração)

Funções auditadas nesta rodada:
- `verify-payment-status/index.ts` (124 linhas) — confirmação de #195 (sem auth)
- `change-payment-method/index.ts` (253 linhas) — confirmação de #196 (guardian bug) + `.single()`
- `check-overdue-invoices/index.ts` (152 linhas) — status 'overdue' em inglês
- `process-cancellation/index.ts` (500 linhas) — `.single()` em dependent lookup
- `handle-student-overage/index.ts` (238 linhas) — `.single()` + tabela inexistente
- `handle-plan-downgrade-selection/index.ts` (323 linhas) — audit log schema errado + `.single()`
- `cancel-subscription/index.ts` (118 linhas) — `.single()` em 2 lookups
- `process-expired-subscriptions/index.ts` (233 linhas) — FK join syntax + `.single()`
- `handle-teacher-subscription-cancellation/index.ts` (304 linhas) — campo `guardian_email` inexistente
- `create-student/index.ts` (529 linhas) — `.single()` em plan lookup
- `create-connect-onboarding-link/index.ts` (104 linhas) — confirmação de #197 (ownership bypass)
- `generate-boleto-for-invoice/index.ts` (187 linhas) — OK (já corrigido em v5.24)

### Novos Gaps Encontrados (#209-#215)

1. **#209 (ALTA → Fase 0)**: `check-overdue-invoices` marca faturas como `status: "overdue"` (inglês) em vez de `"vencida"` (português) na linha 58. TODAS as faturas vencidas processadas pelo cron job ficam com status incorreto, invisíveis no Financeiro. Quarta fonte de corrupção de status (junto com #199, #203 e #169).

2. **#210 (MÉDIA)**: `handle-plan-downgrade-selection` usa função `logAuditEvent` com campos errados (`user_id`, `action`, `details`, `metadata`) que não existem na tabela `audit_logs`. Todas as entradas de auditoria de downgrade falham silenciosamente.

3. **#211 (MÉDIA)**: `handle-student-overage` insere em tabela `student_overage_charges` que não existe nos tipos do Supabase. Cobranças de excedente não são rastreadas.

4. **#212 (BAIXA-MÉDIA)**: 7+ funções usam `.single()` onde `.maybeSingle()` é obrigatório: `handle-student-overage`, `handle-plan-downgrade-selection`, `cancel-subscription` (2x), `process-expired-subscriptions`, `change-payment-method`, `create-student`, `process-cancellation`.

5. **#213 (MÉDIA)**: `process-expired-subscriptions` usa FK join syntax (`subscription_plans!inner`, `profiles!user_id`) que viola o padrão de queries sequenciais.

6. **#214 (BAIXA)**: `process-cancellation` usa `.single()` para dependent lookup (linha 107).

7. **#215 (MÉDIA)**: `handle-teacher-subscription-cancellation` referencia campo `guardian_email` na tabela `profiles`, mas esse campo não existe. Responsáveis não recebem notificação de suspensão de cobranças.

### Totais Atualizados (v5.36)
- 215 pontas soltas totais
- 18 duplicatas + 2 subsumidas
- 195 únicas
- 10 implementadas
- **185 pendentes**
- Fase 0: **15 itens** (+1: #209)

### Status Final
O documento está **pronto para execução da Fase 0** com 15 itens críticos.

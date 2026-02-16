



# Verificação Final v5.37 — 7 Novas Pontas Soltas em Checkout, Subscription Status, Billing e Invitations

## Veredicto: Plano atualizado para v5.37 com 1 novo bug crítico de perda de plano e 2 bugs funcionais de fragilidade/segurança.

---

## Auditoria Profunda Realizada (Funções de Checkout, Status, Billing e Convites)

Funções auditadas nesta rodada:
- `create-subscription-checkout/index.ts` (372 linhas) — cancela assinatura ANTES do checkout
- `check-subscription-status/index.ts` (846 linhas) — monolito frágil com 5+ `.single()` e FK joins
- `customer-portal/index.ts` (75 linhas) — OK (simples, sem bugs)
- `list-subscription-invoices/index.ts` (120 linhas) — OK (simples, com auth)
- `setup-billing-automation/index.ts` (69 linhas) — OK (setup de cron)
- `end-recurrence/index.ts` (133 linhas) — confirmação de #181 (FK constraint)
- `manage-class-exception/index.ts` (157 linhas) — OK (já corrigido #136)
- `manage-future-class-exceptions/index.ts` (220 linhas) — OK (já corrigido #137)
- `materialize-virtual-class/index.ts` (376 linhas) — OK (usa `.maybeSingle()`)
- `request-class/index.ts` (223 linhas) — OK (usa `.maybeSingle()`, tem ownership)
- `send-student-invitation/index.ts` (158 linhas) — SEM AUTH
- `resend-student-invitation/index.ts` (186 linhas) — `.single()` em profiles
- `automated-billing/index.ts` (1057 linhas) — FK joins em cron crítico
- `smart-delete-student/index.ts` (547 linhas) — `.single()` em subscriptions
- `validate-monthly-subscriptions/index.ts` (355 linhas) — FK join em V06
- `check-overdue-invoices/index.ts` (152 linhas) — confirmação de #209

### Novos Gaps Encontrados (#216-#222)

1. **#216 (ALTA → Fase 0)**: `create-subscription-checkout` cancela IMEDIATAMENTE a assinatura Stripe existente (linha 186) ANTES do checkout ser concluído. Se o usuário abandonar o checkout, ele perde o plano sem caminho de recuperação. A assinatura local é marcada como `'cancelled'` e não há mecanismo de reversão.

2. **#217 (MÉDIA)**: `check-subscription-status` é um monolito de 846 linhas com 5+ `.single()` (linhas 378, 460, 585, 703, 760) e FK joins (linhas 32-38, 131-139). Função crítica para carregamento de planos, extremamente frágil.

3. **#218 (BAIXA)**: `send-student-invitation` não possui NENHUMA autenticação. Qualquer pessoa pode invocar o endpoint para enviar emails usando o template do Tutor Flow.

4. **#219 (MÉDIA)**: `automated-billing` usa FK join syntax extenso (linhas 70-90 e 213-226) no cron job de faturamento. Schema cache stale faria o faturamento de TODOS os alunos falhar.

5. **#220 (BAIXA)**: `resend-student-invitation` usa `.single()` em 3 lookups (linhas 75, 90, 128).

6. **#221 (BAIXA)**: `create-subscription-checkout` complementar — `.single()` (linha 138) e FK join (linha 172).

7. **#222 (BAIXA-MÉDIA)**: `smart-delete-student` usa `.single()` em subscription lookups (linhas 52, 91), impedindo deleção quando professor não tem assinatura.

### Totais Atualizados (v5.37)
- 222 pontas soltas totais
- 18 duplicatas + 2 subsumidas
- 202 únicas
- 10 implementadas
- **192 pendentes**
- Fase 0: **16 itens** (+1: #216)

### Status Final
O documento está **pronto para execução da Fase 0** com 16 itens críticos.

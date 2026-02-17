


# Verificação Final v5.61 — 18 Novas Pontas Soltas (24ª Passagem: Auth Gaps em Cancellation/Notification, Raw SQL Injection, Smart-Delete Wrong Params, FK Joins em Checkout)

## Veredicto: Plano atualizado para v5.61 com 8 achados expandindo Fase 0 — handle-teacher-subscription-cancellation sem auth JWT (#488 CRÍTICO), send-cancellation-notification sem auth permitindo phishing (#500 CRÍTICO), send-class-report-notification sem auth phishing (#502 CRÍTICO), setup-class-reminders-automation exec_sql raw SQL injection (#495 CRÍTICO), process-payment-failure-downgrade invoca smart-delete-student com params errados (#493 ALTO), create-subscription-checkout FK join subscription_plans (#497 ALTO), handle-teacher-subscription-cancellation sem stripeAccount (#489 ALTO), handle-teacher-subscription-cancellation envia email para student.email ao invés de guardian_email (#491 ALTO).

---

## Auditoria de 24ª Passagem (Auth Gaps em Cancellation/Notification, Raw SQL, Smart-Delete Wrong Params, FK Joins em Checkout)

Funções auditadas nesta rodada (24ª passagem):
- `handle-teacher-subscription-cancellation/index.ts` — SEM AUTH JWT (#488 CRÍTICO), sem stripeAccount L122 (#489 ALTO), .single() L252 em teacher profile (#490 MÉDIO), envia email para student.email ao invés de guardian_email L285 (#491 ALTO)
- `process-payment-failure-downgrade/index.ts` — persistSession ausente L22 (#492 MÉDIO), smart-delete-student com params errados L144-152 (#493 ALTO), .single() L55 em subscription (#494 MÉDIO)
- `setup-class-reminders-automation/index.ts` — exec_sql RPC para SQL arbitrário L24/L37/L51 (#495 CRÍTICO SEGURANÇA), ANON_KEY inline L49/L61 (#496 ALTO)
- `create-subscription-checkout/index.ts` — FK join subscription_plans(*) L172-173 (#497 ALTO), .single() L175 em existing subscription (#498 MÉDIO), .single() L138 em plan lookup (#505 MÉDIO)
- `send-cancellation-notification/index.ts` — SEM AUTH JWT (#500 CRÍTICO phishing), persistSession ausente L37 (#499 MÉDIO), .single() 4x em dependent lookups L117/L147/L277/L374 (#501 MÉDIO)
- `send-class-report-notification/index.ts` — SEM AUTH JWT (#502 CRÍTICO phishing), .single() 5x L37/L49/L74/L107/L142 (#503 MÉDIO)
- `create-connect-account/index.ts` — .single() L76 em existing account (#504 BAIXO)

### Achados Críticos (→ Fase 0)

1. **#488 (CRÍTICO: SEM AUTH)**: `handle-teacher-subscription-cancellation` não possui NENHUMA validação JWT. Aceita `teacher_id` do body da request. Qualquer chamador anônimo pode cancelar todas as faturas pendentes de qualquer professor, gerar pending_refunds e enviar emails de notificação para todos os alunos. Vetor de sabotagem financeira massiva.

2. **#495 (CRÍTICO: SQL INJECTION)**: `setup-class-reminders-automation` L24/L37/L51 usa RPC `exec_sql` para executar strings SQL arbitrárias. Isto viola a regra fundamental de Edge Functions: "Never execute raw SQL queries". Se a RPC `exec_sql` existir e for acessível, constitui um vetor de SQL injection catastrófico. Mesmo sem injeção externa, o padrão é inseguro e não auditável.

3. **#500 (CRÍTICO: PHISHING)**: `send-cancellation-notification` não possui NENHUMA autenticação. Aceita `class_id`, `cancelled_by_type`, `cancellation_reason` e `participants` do body. Qualquer chamador anônimo pode enviar emails de cancelamento falsos com nomes de professores spoofados para qualquer aluno, constituindo um vetor de phishing direto. Conforme memória `security/notification-auth-phishing-prevention`.

4. **#502 (CRÍTICO: PHISHING)**: `send-class-report-notification` não possui NENHUMA autenticação. Aceita `classId` e `reportId` do body. Usa service_role para acessar dados. Qualquer chamador anônimo pode disparar emails com conteúdo de relatórios reais para alunos, ou explorar IDs para enumerar dados.

5. **#493 (ALTO: PARAMS ERRADOS)**: `process-payment-failure-downgrade` L144-152 invoca `smart-delete-student` com `{ studentId: student.student_id, reason: 'payment_failure_downgrade' }`. Conforme memória `features/downgrade/payment-failure-student-removal-bug`, `smart-delete-student` espera `student_id` (snake_case), `teacher_id` e `relationship_id`. Resultado: TODAS as remoções de alunos excedentes falham silenciosamente no downgrade por falha de pagamento.

6. **#497 (ALTO: FK JOIN)**: `create-subscription-checkout` L172-173 `user_subscriptions.select('*, subscription_plans(*)')` usa FK join proibido. Schema cache do Deno → crash do checkout → professor não consegue mudar de plano.

7. **#489 (ALTO: stripeAccount AUSENTE)**: `handle-teacher-subscription-cancellation` L122 `stripe.invoices.retrieve(invoice.stripe_invoice_id)` sem parâmetro `stripeAccount`. Se faturas foram criadas em contas Connect, são invisíveis da plataforma → "resource not found" → faturas NÃO são voidadas no Stripe mas SIM atualizadas localmente → inconsistência.

8. **#491 (ALTO: DESTINATÁRIO ERRADO)**: `handle-teacher-subscription-cancellation` L285 envia email de notificação para `student.email` diretamente. Conforme memória `database/responsible-party-contact-teacher-student-relationships`, o email correto está em `teacher_student_relationships.student_guardian_email`. Responsáveis/pais NÃO recebem notificação de suspensão de cobranças.

### Achados Médios/Baixos

9. **#490 (MÉDIO)**: `handle-teacher-subscription-cancellation` L252 `.single()` para teacher profile em sendNotifications. Se teacher profile não existir, função de notificação crasheia.

10. **#492 (MÉDIO)**: `process-payment-failure-downgrade` L22-23 `createClient` sem `{ auth: { persistSession: false } }`. Padrão obrigatório em Edge Functions.

11. **#494 (MÉDIO)**: `process-payment-failure-downgrade` L55 `.single()` para active subscription. Se múltiplas subscriptions ativas (estado de bug), downgrade crasheia.

12. **#496 (ALTO SEGURANÇA)**: `setup-class-reminders-automation` L49/L61 expõe `SUPABASE_ANON_KEY` inline na definição SQL do cron job. Mesmo padrão de #425 (setup-billing-automation). Chave visível em logs de sistema e definições pg_cron.

13. **#498 (MÉDIO)**: `create-subscription-checkout` L175 `.single()` para existing subscription. Múltiplas subscriptions ativas → crash do checkout.

14. **#499 (MÉDIO)**: `send-cancellation-notification` L37-38 `createClient` sem `{ auth: { persistSession: false } }`.

15. **#501 (MÉDIO)**: `send-cancellation-notification` L117/L147/L277/L374 usa `.single()` para buscar dependentes dentro de loops de notificação. Dependente inexistente → crash do loop → demais participantes não são notificados.

16. **#503 (MÉDIO)**: `send-class-report-notification` L37/L49/L74/L107/L142 usa `.single()` em 5 locais (class, teacher, report, student profile, relationship). Qualquer registro ausente crasheia a função inteira.

17. **#504 (BAIXO)**: `create-connect-account` L76-77 `.single()` para existing connect account. Múltiplos registros para mesmo payment_account_id → crash ao invés de graceful handling.

18. **#505 (MÉDIO)**: `create-subscription-checkout` L138 `.single()` para plan lookup. Plano inativo ou inexistente → crash 500 ao invés de erro amigável.

### Padrão Sistêmico Novo: exec_sql RPC em Setup Functions

Identificado que `setup-class-reminders-automation` usa uma RPC `exec_sql` para executar strings SQL arbitrárias, contornando todas as proteções do Supabase client. Este padrão é uma violação grave de segurança. Diferente de `setup-billing-automation` que usa `cron_schedule` RPC (seguro), esta função monta e executa SQL bruto, incluindo `CREATE EXTENSION` e `cron.schedule` com interpolação de variáveis.

### Padrão Sistêmico Confirmado: Notification Functions sem Auth

Com #500 e #502, confirma-se que TODAS as funções de notificação por email são vetores de phishing: `send-cancellation-notification`, `send-class-report-notification`, `send-student-invitation` (#454), `send-material-shared-notification` (#455). O padrão é sistêmico: funções que enviam emails aceitam dados do corpo da request sem autenticação, permitindo spoofing de identidade do professor.

### Totais Atualizados (v5.61)
- 505 pontas soltas totais | 475 únicas | **463 pendentes**
- Fase 0: **116 itens** (+8: #488, #495, #500, #502, #493, #497, #489, #491)
- **100% cobertura**: 75 funções auditadas (24 passagens)

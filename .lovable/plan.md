
# Etapa 0.1 — Corrigir Status Mismatch pt-BR ✅
# Etapa 0.2 — Guard Clauses / Race Conditions ✅
# Etapa 0.3 — Webhook Resilience / HTTP 500 ✅
# Etapa 0.4 — Audit Logs Schema Mismatch ✅
# Etapa 0.5 — .single() → .maybeSingle() ✅
# Etapa 0.6 — FK Joins proibidos no Deno ✅
# Etapa 0.7 — Categoria A: Auth/IDOR ✅
# Etapa 0.8 — Categoria H: FK Cascade / Deletion Failures ✅
# Etapa 0.9 — Categoria I: Data Corruption ✅
# Etapa 0.10 — Categoria J: Integridade de dados ✅
# Etapa 0.11 — Categoria K: ANON_KEY inline / SQL injection em setup ✅

## Etapa 0.11 — Resumo

Corrigidos 5 Edge Functions de setup de automação que usavam padrões inseguros:

### Problemas Corrigidos

1. **`setup-class-reminders-automation`**: Removido uso de `exec_sql` RPC (vetor de SQL injection) → substituído por `cron_schedule`/`cron_unschedule` RPCs tipadas
2. **`setup-orphan-charges-automation`**: Removido uso de `exec_sql` RPC → substituído por `cron_schedule`/`cron_unschedule` RPCs tipadas
3. **`setup-billing-automation`**: Padronizado com `cron_unschedule` antes de `cron_schedule` (idempotência) + prefixo de log consistente
4. **`setup-expired-subscriptions-automation`**: Padronizado com `cron_unschedule` antes de `cron_schedule` (idempotência) + prefixo de log consistente
5. **`setup-invoice-auto-verification`**: Já usava RPCs corretas, padronizado construção de URL via variável `functionUrl`

### Padrão Seguro Adotado

Todas as 5 funções agora seguem o mesmo padrão:
```
1. Validar env vars (SUPABASE_URL, SUPABASE_ANON_KEY)
2. cron_unschedule(p_jobname) — remover job existente (idempotente)
3. cron_schedule(p_jobname, p_schedule, p_command) — criar novo job
4. Retornar resultado com schedule info
```

Nenhuma função de setup usa mais `exec_sql` ou `rpc('exec_sql', { sql: ... })`.

## Etapa 0.10 — Resumo

Corrigidos 8 problemas de integridade de dados em 3 Edge Functions:

1. **#396 handle-student-overage**: Removido INSERT em tabela `student_overage_charges` inexistente → substituído por audit_log + log de console
2. **#360/#556 check-overdue-invoices**: Substituído `class_notifications.class_id = invoice.id` (FK violation semântica) por `teacher_notifications` com `source_type='invoice'`
3. **#361 check-overdue-invoices**: Adicionado INSERT de `teacher_notification` após envio de notificação para prevenir spam infinito em cron runs subsequentes
4. **#359 check-overdue-invoices**: Confirmado que já usa status pt-BR ('pendente', 'vencida') corretamente + adicionado `teacher_id` à query SELECT
5. **#565 handle-teacher-subscription-cancellation**: Removida referência a `guardian_email` inexistente em profiles → busca correta via `teacher_student_relationships.student_guardian_email`
6. **#577 handle-teacher-subscription-cancellation**: Substituído check de `RESEND_API_KEY` por `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (função usa AWS SES, não Resend)
7. **#578 handle-teacher-subscription-cancellation**: Adicionado cancelamento de Payment Intents pendentes antes de voiding invoices (estados: requires_payment_method, requires_confirmation, requires_action, processing)
8. **handle-teacher-subscription-cancellation**: Status de cancelamento corrigido de `cancelada_por_professor_inativo` (não padrão) para `cancelada` (padrão pt-BR) com guard clause `.eq('status', 'pendente')`

## Etapa 0.9 — Resumo

Corrigidos 7 problemas de Data Corruption em 4 Edge Functions:

1. **#74 webhook-stripe-connect**: `invoice.payment_succeeded` preserva `payment_method` original
2. **#548 webhook-stripe-connect**: `payment_intent.succeeded` não apaga mais `boleto_url`/`pix_qr_code` (recibos)
3. **#202/#493 process-payment-failure-downgrade**: FK join removido, queries sequenciais
4. **#364 automated-billing**: Idempotência para faturas mensais duplicadas
5. **automated-billing validateTeacherCanBill**: variável `plan` corrigida
6. **#259 validate-payment-routing**: Não cria mais fatura REAL como teste

## Etapa 0.8 — Resumo

Corrigidos ~8 problemas de FK cascade/deletion em 4 Edge Functions que causavam falhas silenciosas ou erros 500 por violação de foreign key RESTRICT.

### Funções Corrigidas

1. **smart-delete-student** (3 correções)
   - `deleteDependentsCascade()`: Adicionada limpeza de `invoice_classes` (via participant_ids) ANTES de deletar `class_participants`
   - Full delete path: Mesma correção + limpeza de `invoice_classes` para participações diretas do aluno
   - Adicionada limpeza de `student_monthly_subscriptions` ANTES de deletar `teacher_student_relationships` (ambos os paths: unlink e delete)

2. **delete-dependent** (2 correções)
   - Removido comentário incorreto ("FK SET NULL" — era RESTRICT)
   - Adicionada limpeza de `invoice_classes` para participant_ids do dependente ANTES de deletar `class_participants`
   - Adicionada deleção explícita de `class_participants` antes de deletar dependente

3. **end-recurrence** (1 correção major)
   - Antes: deletava classes diretamente → FK violation em `class_participants`, `class_exceptions`, `invoice_classes`
   - Agora: cascade correto em 6 passos: `invoice_classes` → `class_exceptions` → `class_notifications` → `class_participants` → `classes`

4. **archive-old-data** (3 correções)
   - Removida seleção de `student_id` inexistente na tabela `classes`
   - Removidos FK joins (`class_participants(...)`, `class_reports(...)`) → substituídos por queries sequenciais
   - Cascade de deleção completo: `invoice_classes` → `class_report_photos` → `class_report_feedbacks` → `class_reports` → `class_notifications` → `class_exceptions` → `class_participants` → `classes`

### Ordem de Deleção Segura (Padrão)

```
invoice_classes (participant_id FK RESTRICT)
  → class_report_photos (report_id FK)
  → class_report_feedbacks (report_id FK)
  → class_reports (class_id FK)
  → class_notifications (class_id FK)
  → class_exceptions (original_class_id FK)
  → class_participants (class_id FK)
  → student_monthly_subscriptions (relationship_id FK)
  → teacher_student_relationships
  → classes
```

## Próximas Etapas Pendentes (Fase 0)

- **Categoria L**: Outros itens Fase 0 (~20 itens)

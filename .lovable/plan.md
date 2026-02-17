
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
# Etapa 0.12 — Categoria L: Outros itens Fase 0 ✅

## Etapa 0.12 — Resumo

Corrigidos 15 problemas em 9 Edge Functions — últimos itens da Fase 0:

### stripeAccount para Connect (#553, #554)
1. **auto-verify-pending-invoices**: Adicionado lookup de `business_profiles.stripe_connect_id` por `teacher_id` e passagem de `stripeAccount` ao `stripe.paymentIntents.retrieve()` para faturas de Stripe Connect
2. **verify-payment-status**: Mesmo padrão — stripeAccount passado ao retrieve do Payment Intent

### SERVICE_ROLE_KEY como Bearer (#563/#80)
3. **process-cancellation**: Substituído `Bearer ${SERVICE_ROLE_KEY}` por `Bearer ${token}` (token JWT do usuário autenticado) na chamada a `create-invoice`, evitando que `getUser()` falhe

### FK Join → Sequential (#113)
4. **check-pending-boletos**: Substituído FK join `subscription_plans (name)` por query sequencial com `planMap`

### .single() → .maybeSingle() (#387, #391, #394 + check-subscription-status)
5. **create-student**: `.single()` → `.maybeSingle()` no lookup de `subscription_plans`
6. **process-expired-subscriptions**: `.single()` → `.maybeSingle()` no lookup do free plan
7. **check-subscription-status**: 6× `.single()` → `.maybeSingle()` em lookups de `subscription_plans` (linhas 384, 466, 591, 710, 740, 766)

### Duplicatas e persistSession (#146, #142)
8. **create-business-profile**: Adicionada verificação de `business_profiles` existente antes de criar conta Stripe Connect (previne contas órfãs)
9. **check-business-profile-status**: Adicionado `{ auth: { persistSession: false } }` ao createClient

### Itens já resolvidos em etapas anteriores
- #112 (Payment Intents) → Corrigido na Etapa 0.10
- #110 (RESEND_API_KEY) → Corrigido na Etapa 0.10
- #109 (subsumido por #202) → Corrigido na Etapa 0.9
- #387 smart-delete-student: Já não possui `.single()` em plan lookup
- #264 handle-plan-downgrade-selection: Já usa RPC `count_teacher_students_and_dependents`

### Itens deferidos (risco alto de regressão)
- check-subscription-status FK join `subscription_plans (*)` na query principal (linha 141-148): refatoração de 856 linhas com 20+ referências a `subscription.subscription_plans` — requer etapa dedicada

## Fase 0 — COMPLETA ✅

Todas as categorias A-L da Fase 0 foram implementadas. O projeto está pronto para prosseguir com as **Fases 2-8** do plano de cobrança híbrida.

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

## Fase 2 — Settings/BillingSettings: charge_timing ✅

Adicionado card de seleção do modelo de cobrança (prepaid/postpaid) ao `BillingSettings.tsx`:

1. **Card "Modelo de Cobrança"**: Dois cards selecionáveis ("Cobrar Antes" / "Cobrar Depois") com descrições detalhadas de cada modelo
2. **Card informativo**: Explica como o modelo afeta aulas avulsas, sem impacto em mensalidades ou aulas gratuitas
3. **Carregamento**: Query a `business_profiles` com `.maybeSingle()` para buscar `charge_timing` — card só aparece se professor tem business profile
4. **Salvamento**: `UPDATE business_profiles SET charge_timing = ...` executado junto com as demais configurações
5. **i18n**: Chaves `chargeTiming.*` adicionadas em PT e EN (`billing.json`)

## Fase 3 — ClassForm: is_paid_class + bloqueio recorrência ✅

Adicionado campo `is_paid_class` ao formulário de agendamento de aulas:

1. **Interface `ClassFormData`**: Novo campo `is_paid_class: boolean` (default `true`)
2. **Switch "Aula Cobrada"**: Toggle entre tipo de aula (experimental) e seleção de serviço, visível apenas quando `is_experimental = false`
3. **Bloqueio de recorrência**: Quando `charge_timing = 'prepaid'` E `is_paid_class = true`, checkbox de recorrência é desabilitado com tooltip explicativo
4. **Aula experimental**: Forçar `is_paid_class = false` quando experimental é marcado
5. **Carregamento de `charge_timing`**: Query a `business_profiles` ao abrir o dialog para verificar modelo do professor
6. **request-class Edge Function**: Aulas solicitadas por alunos agora definem `is_paid_class: false` por padrão (professor decide cobrança separadamente)
7. **i18n**: Chaves `isPaidClass`, `isPaidClassDescription`, `recurrenceBlockedPrepaid` em PT e EN

## Fase 4 — automated-billing RPC + materialize (filtro is_paid_class) ✅

Adicionado filtro `is_paid_class = true` à RPC e propagação do campo na materialização:

1. **RPC `get_unbilled_participants_v2`**: Adicionado `AND c.is_paid_class = true` — apenas aulas pagas são retornadas para faturamento
2. **Edge function `materialize-virtual-class`**: Campo `is_paid_class` agora é herdado do template ao criar aula materializada
3. **Frontend `Agenda.tsx`**: `materializeVirtualClass` propaga `is_paid_class` do template virtual para a aula materializada
4. **Interface `ClassWithParticipants`**: Adicionado campo `is_paid_class?: boolean`

## Fase 5 — Agenda.tsx: persistir is_paid_class + gerar fatura pré-paga ✅

1. **`baseClassData`**: Adicionado `is_paid_class: formData.is_paid_class` ao payload de inserção
2. **Geração de fatura pré-paga**: Após criar aula + participantes, se `charge_timing === 'prepaid'` E `is_paid_class === true` E `!is_experimental` E não-recorrente → invoca `create-invoice` com `invoice_type: 'prepaid_class'` por participante
3. **Aulas em grupo**: Cada participante recebe fatura individual
4. **Resiliência**: Erros de fatura não bloqueiam a criação da aula (toast de aviso)

## Fase 6 — Cancelamento: process-cancellation + CancellationModal ✅

1. **process-cancellation**: Adicionado `is_paid_class` ao select da aula + busca `charge_timing` do `business_profiles`
   - `is_paid_class = false` → `shouldCharge = false` (aula gratuita)
   - `charge_timing = 'prepaid'` + `is_paid_class = true` → `shouldCharge = false` (já cobrada)
   - Invariante: faturas `invoice_type = 'cancellation'` nunca criadas para aulas prepaid/gratuitas
2. **CancellationModal**: Interface `VirtualClassData` e `classData` incluem `is_paid_class` e `charge_timing`
   - Query da aula inclui `is_paid_class`
   - Busca `charge_timing` do professor via `business_profiles`
   - `willBeCharged = false` para aulas gratuitas e pré-pagas
   - Alertas visuais: prepaid (âmbar) e gratuita (esmeralda) com mensagens contextuais
3. **i18n**: Adicionadas chaves `alert.prepaid.*` e `alert.unpaid.*` em PT e EN

## Fase 7 — AmnestyButton: verificação de faturamento + label ✅

1. **Verificação de billing**: `useEffect` consulta `invoice_classes` com join `invoices!inner` filtrando `status != 'cancelada'` para detectar se a aula já foi incluída em fatura processada
2. **Bloqueio visual**: Se `isBilled = true`, botão renderiza com ícone `Ban` + tooltip explicativo (`billedTooltip`) em vez do dialog
3. **Estado de loading**: `checkingBilling` mantém botão desabilitado enquanto a verificação está em andamento
4. **i18n**: Adicionada chave `billedTooltip` em PT e EN

## Fase 8 — InvoiceTypeBadge consolidação + i18n ✅

1. **Novos tipos**: Adicionados `prepaid_class` (âmbar, ícone CreditCard), `cancellation` (vermelho, ícone XCircle), `orphan_charges` (laranja, ícone AlertTriangle), `regular` (cinza, ícone FileText) ao mapeamento
2. **i18n**: Adicionada chave `invoiceTypes.prepaidClass` em PT ("Pré-paga") e EN ("Prepaid")
3. **Fallback**: Tipos desconhecidos usam config `manual` como fallback

## Implementação Híbrida — COMPLETA ✅

Todas as 8 fases (0-8) da cobrança híbrida foram implementadas com sucesso.

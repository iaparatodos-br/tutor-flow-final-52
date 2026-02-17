

# Checklist de Implementacao — Cobranca Hibrida

O documento `docs/hybrid-billing-implementation-plan.md` (v5.65) contem 9 fases (0-8), com a Fase 0 sendo a maior e mais critica. Abaixo, cada fase foi subdividida em etapas pequenas e independentes para implementacao incremental. As etapas dentro de cada fase seguem uma ordem logica de dependencia.

---

## Fase 0 — Batch Critico (141 itens unicos)

Esta fase DEVE ser concluida antes de qualquer outra. Subdividida em 12 etapas por categoria:

### Etapa 0.1 — Status Mismatch pt-BR (Cat B — 8 itens)
- [ ] Corrigir `webhook-stripe-connect`: trocar 'paid' por 'paga' e 'overdue' por 'vencida' em TODOS os handlers (#169, #203, #329, #546, #547, #550)
- [ ] Corrigir `cancel-payment-intent`: trocar 'paid' por 'paga' (#199, #262, #334)
- [ ] Corrigir `check-overdue-invoices`: trocar 'overdue' por 'vencida' (#209, #555)

> **Por que primeiro?** Sem isso, faturas pagas sao revertidas e faturas vencidas nunca sao encontradas. Impacto financeiro direto.

### Etapa 0.2 — Guard Clauses / Race Conditions (Cat C — 12 itens)
- [ ] `check-overdue-invoices`: adicionar guard de status terminal antes do UPDATE (#155, #187, #557)
- [ ] `auto-verify-pending-invoices`: adicionar guard de status terminal (#156)
- [ ] `verify-payment-status`: adicionar guard de status terminal (#158)
- [ ] `webhook-stripe-connect`: adicionar guard de status terminal nos handlers + verificar payment_origin (#160, #250, #251, #550)
- [ ] `create-subscription-checkout`: nao cancelar assinatura antes do checkout completar (#216, #296)
- [ ] `handle-teacher-subscription-cancellation`: guard clause para nao sobrescrever faturas pagas (#566)

### Etapa 0.3 — Webhook Resilience / HTTP 500 (Cat D — 9 itens)
- [ ] `webhook-stripe-connect`: retornar HTTP 200 no catch para erros permanentes (#192, #256, #549, #77)
- [ ] `webhook-stripe-subscriptions`: retornar HTTP 200 no catch (#257, #294)
- [ ] `automated-billing`: retornar HTTP 200 no catch (#76)
- [ ] `create-invoice`: retornar HTTP 200 no catch (#72)
- [ ] `process-cancellation`: retornar HTTP 200 no catch (#83)

### Etapa 0.4 — Autenticacao/IDOR criticos (Cat A — 25 itens, divididos em 3 sub-etapas)

**0.4a — Edge functions de pagamento (criticas)**
- [ ] `create-payment-intent-connect`: adicionar autenticacao JWT (#175)
- [ ] `verify-payment-status`: adicionar auth (#195)
- [ ] `change-payment-method`: corrigir bypass de autorizacao (#170, #196)
- [ ] `cancel-payment-intent`: verificar status do PI antes de cancelar (#122)

**0.4b — Edge functions de notificacao (10 funcoes)**
- [ ] `send-student-invitation`: adicionar auth (#372, #454)
- [ ] `send-class-report-notification`: adicionar auth (#373, #576)
- [ ] `send-material-shared-notification`: adicionar auth (#374, #455)
- [ ] `send-cancellation-notification`: adicionar auth (#500)
- [ ] `send-class-request-notification`: adicionar auth (#507)
- [ ] `send-class-confirmation-notification`: adicionar auth (#508)
- [ ] `send-invoice-notification`: adicionar auth (#509)
- [ ] `send-boleto-subscription-notification`: adicionar auth (#525)
- [ ] `resend-confirmation`: adicionar auth (#358)

**0.4c — Edge functions de gestao**
- [ ] `smart-delete-student`: adicionar auth e validar teacher_id do JWT (#282, #384)
- [ ] `process-cancellation`: adicionar auth JWT + impedir identity spoofing via cancelled_by (#289, #290)
- [ ] `handle-teacher-subscription-cancellation`: adicionar auth (#350, #564)
- [ ] `stripe-events-monitor`: adicionar auth (#572)
- [ ] `validate-business-profile-deletion`: adicionar auth (#573)
- [ ] `refresh-stripe-connect-account`: corrigir IDOR com filtro teacher_id (#574)
- [ ] `check-email-availability`: adicionar auth + rate limit (#402)

### Etapa 0.5 — Data Corruption (Cat I — 6 itens)
- [ ] `webhook-stripe-connect`: corrigir handlers invoice.* que nunca encontram faturas internas (#87)
- [ ] `webhook-stripe-connect`: impedir wipe de payment metadata (boleto_url, pix_qr_code) (#548)
- [ ] `webhook-stripe-connect`: nao sobrescrever payment_method em invoice.payment_succeeded (#74)
- [ ] `process-payment-failure-downgrade`: corrigir parametros para smart-delete-student (#202, #493)
- [ ] `automated-billing`: adicionar idempotencia para faturas mensais (#364)
- [ ] `validate-payment-routing`: impedir criacao de fatura real como teste (#259)

### Etapa 0.6 — Integridade de dados (Cat J — 8 itens)
- [ ] `handle-student-overage`: verificar/criar tabela `student_overage_charges` (#396)
- [ ] `check-overdue-invoices`: corrigir faturas vencidas invisiveis por status ingles (#359)
- [ ] `check-overdue-invoices`: corrigir class_id = invoice.id semantico (#360, #556)
- [ ] `check-overdue-invoices`: corrigir spam infinito com INSERT de tracking (#361)
- [ ] `handle-teacher-subscription-cancellation`: remover referencia a guardian_email inexistente (#565)
- [ ] `handle-teacher-subscription-cancellation`: tratar RESEND_API_KEY inexistente (#577)
- [ ] `handle-teacher-subscription-cancellation`: cancelar Payment Intents ativos (#578)

### Etapa 0.7 — FK Joins proibidos no Deno (Cat E — 15 itens)
- [ ] `smart-delete-student`: refatorar `classes!inner` para queries sequenciais (#385)
- [ ] `process-expired-subscriptions`: refatorar FK joins (#393)
- [ ] `automated-billing`: refatorar FK joins (4 ocorrencias) (#362, #363, #558, #559)
- [ ] `create-invoice`: refatorar FK joins (#560, #561)
- [ ] `create-payment-intent-connect`: refatorar 3 FK joins (#119)
- [ ] `change-payment-method`: refatorar FK joins (#114)
- [ ] `create-subscription-checkout`: refatorar FK join + .single() (#371)
- [ ] `check-subscription-status`: refatorar FK joins (#351)
- [ ] `send-class-reminders`: refatorar FK joins (#120, #347)
- [ ] `generate-boleto-for-invoice`: refatorar FK joins (#121)
- [ ] `get-teacher-availability`: refatorar FK join (#405)

### Etapa 0.8 — .single() criticos (Cat F — 20 itens)
- [ ] `smart-delete-student`: .single() -> .maybeSingle() em user_subscriptions (#280)
- [ ] `send-invoice-notification`: corrigir 3x .single() (#159, #348)
- [ ] `cancel-subscription`: .single() -> .maybeSingle() (#369)
- [ ] `create-subscription-checkout`: .single() -> .maybeSingle() (#370)
- [ ] `send-class-report-notification`: corrigir 6x .single() em loop (#272, #575)
- [ ] `verify-payment-status`: .maybeSingle() (#157)
- [ ] `process-cancellation`: .maybeSingle() em dependent (#161)
- [ ] `create-invoice`: .maybeSingle() em guardian/relationship (#162)
- [ ] `handle-student-overage`: .maybeSingle() (#167)
- [ ] `send-cancellation-notification`: corrigir 4x .single() (#168, #271)
- [ ] `webhook-stripe-connect`: corrigir .single() em handlers (#173, #190, #297)
- [ ] `cancel-payment-intent`: .maybeSingle() (#174)
- [ ] `create-payment-intent-connect`: .maybeSingle() em cascata (#177)
- [ ] `process-payment-failure-downgrade`: corrigir 2x .single() (#253)
- [ ] `send-class-reminders`: .maybeSingle() em teacher e relationship (#267, #268)
- [ ] `smart-delete-student`: .maybeSingle() em plan lookup (#387)
- [ ] `create-student`: .maybeSingle() em plan lookup (#391)
- [ ] `process-expired-subscriptions`: .maybeSingle() em free plan (#394)

### Etapa 0.9 — Audit Logs schema mismatch (Cat G — 4 itens)
- [ ] `audit-logger` (funcao compartilhada): corrigir colunas user_id->actor_id, action->operation (#277)
- [ ] `handle-plan-downgrade-selection`: corrigir schema de audit (#258, #568)
- [ ] `process-payment-failure-downgrade`: verificar se RPC write_audit_log existe (#356)

### Etapa 0.10 — FK Cascade / Deletion (Cat H — 8 itens)
- [ ] `end-recurrence`: limpar class_participants e class_exceptions antes do DELETE (#365, #181)
- [ ] `smart-delete-student`: corrigir cascade incompleta nos paths unlink e delete (#389, #390)
- [ ] `archive-old-data`: remover referencia a student_id fantasma (#580, #397)
- [ ] `archive-old-data`: corrigir FK cascade failure em class_exceptions/invoice_classes (#581, #398)

### Etapa 0.11 — ANON_KEY inline / SQL injection (Cat K — 6 itens)
- [ ] Refatorar todas as 5 setup functions para nao usar ANON_KEY inline em SQL (#315-#319, #328)
- [ ] `setup-class-reminders-automation`: corrigir SQL injection via exec_sql (#495)

### Etapa 0.12 — Outros itens Fase 0 (Cat L — 20 itens)
- [ ] `process-cancellation`: nao usar SERVICE_ROLE_KEY como Bearer para create-invoice (#80, #563)
- [ ] `auto-verify-pending-invoices`: adicionar stripeAccount para Connect (#553)
- [ ] `verify-payment-status`: adicionar stripeAccount para Connect (#554)
- [ ] `handle-teacher-subscription-cancellation`: adicionar stripeAccount (#567)
- [ ] `create-subscription-checkout`: cancelar Payment Intents pendentes (#117)
- [ ] `handle-teacher-subscription-cancellation`: cancelar Payment Intents ativos (#112)
- [ ] `create-business-profile`: adicionar verificacao de duplicatas (#146)
- [ ] `automated-billing`: corrigir mensalidade que nao gera pagamento Stripe (#94)
- [ ] `handle-teacher-subscription-cancellation`: RESEND_API_KEY condicional (#110)
- [ ] `check-subscription-status`: refatorar FK join em checkNeedsStudentSelection (#116)
- [ ] `process-expired-subscriptions`: refatorar FK joins (#111)
- [ ] `check-pending-boletos`: refatorar FK join + fallback "Premium" (#113)
- [ ] `check-business-profile-status`: validar ownership do stripe_connect_id (#142)
- [ ] `handle-plan-downgrade-selection`: contar dependentes (#264)
- [ ] `check-business-profile-status`: adicionar persistSession: false (#579)

---

## Fase 1 — Migracao SQL (CONCLUIDA)
- [x] Adicionar coluna `charge_timing` em `business_profiles`
- [x] Adicionar coluna `is_paid_class` em `classes`

---

## Fase 2 — Settings: Card Charge Timing (4 itens)
- [ ] Criar card "Modelo de Cobranca" em `Settings/BillingSettings.tsx` com opcoes "Cobrar Antes" e "Cobrar Depois"
- [ ] Carregar e salvar `charge_timing` do `business_profiles`
- [ ] Adicionar card informativo explicando cada modelo (texto definido no M4)
- [ ] Adicionar chaves i18n: `billing.chargeTiming.*` (PT e EN)

---

## Fase 3 — ClassForm: Campo is_paid_class (4 itens)
- [ ] Adicionar switch "Aula Cobrada" no ClassForm (visivel apenas quando `is_experimental = false`)
- [ ] Bloquear recorrencia quando `charge_timing = 'prepaid'` E `is_paid_class = true` (com tooltip)
- [ ] Incluir `is_paid_class` no `ClassFormData` (tipo e interface)
- [ ] Adaptar `request-class` para incluir `is_paid_class`

---

## Fase 4 — Automated Billing + Materialize (4 itens)
- [ ] Alterar RPC `get_unbilled_participants_v2`: adicionar `AND c.is_paid_class = true`
- [ ] Edge function `materialize-virtual-class`: propagar `is_paid_class` no objeto de insercao
- [ ] Frontend `materializeVirtualClass` (Agenda.tsx): incluir `is_paid_class` com fallback `?? true`
- [ ] Teste de regressao: rodar `automated-billing` e verificar que aulas existentes nao sao perdidas

---

## Fase 5 — Agenda: Persistir is_paid_class + Fatura Pre-paga (6 itens)
- [ ] `handleClassSubmit` (Agenda.tsx): incluir `is_paid_class` no payload de insercao
- [ ] Alterar tipagem de `handleClassSubmit` de `any` para `ClassFormData`
- [ ] Buscar `charge_timing` do business_profile no ClassForm via useEffect
- [ ] Apos criar aula com sucesso: gerar fatura pre-paga se `charge_timing = 'prepaid'` E `is_paid_class = true`
- [ ] Para aulas em grupo prepaid: gerar uma fatura por participante
- [ ] Refatorar FK joins do `create-invoice` para queries sequenciais (#25, #164, #165)

---

## Fase 6 — Cancelamento (5 itens)
- [ ] `process-cancellation`: buscar `is_paid_class` da aula e forcar `shouldCharge = false` quando `false`
- [ ] `process-cancellation`: buscar `charge_timing` e forcar `shouldCharge = false` quando `prepaid`
- [ ] `CancellationModal`: incluir `is_paid_class` na query e na interface `VirtualClassData`
- [ ] `CancellationModal`: ajustar logica de `willBeCharged` para os novos cenarios
- [ ] Exibir mensagem especifica para aulas pre-pagas canceladas

---

## Fase 7 — AmnestyButton (3 itens)
- [ ] Consultar `invoice_classes` antes de exibir o botao de anistia
- [ ] Se ja faturada: mostrar label "Nao e possivel conceder anistia"
- [ ] Se aula pre-paga cancelada: nao mostrar botao

---

## Fase 8 — Consolidacao Final (5 grupos)
- [ ] Consolidar `InvoiceTypeBadge` com tipos: `prepaid_class`, `cancellation`, `orphan_charges`
- [ ] Migrar `Financeiro.tsx` para usar `InvoiceTypeBadge` como fonte unica
- [ ] Adicionar CHECK constraint de `invoice_type` no banco (#16)
- [ ] Adicionar todas as chaves i18n restantes (classes, cancellation, amnesty, financial)
- [ ] Corrigir todos os itens restantes da Fase 8 (notificacoes, bugs menores, melhorias)

---

## Resumo de Progresso

| Fase | Etapas | Status |
|------|--------|--------|
| 0.1 Status Mismatch | 3 tarefas | Pendente |
| 0.2 Guard Clauses | 6 tarefas | Pendente |
| 0.3 Webhook HTTP 500 | 5 tarefas | Pendente |
| 0.4 Auth/IDOR | 3 sub-etapas (~20 tarefas) | Pendente |
| 0.5 Data Corruption | 6 tarefas | Pendente |
| 0.6 Integridade | 7 tarefas | Pendente |
| 0.7 FK Joins | 11 tarefas | Pendente |
| 0.8 .single() | 18 tarefas | Pendente |
| 0.9 Audit Logs | 3 tarefas | Pendente |
| 0.10 FK Cascade | 4 tarefas | Pendente |
| 0.11 ANON_KEY/SQL Inj | 2 tarefas | Pendente |
| 0.12 Outros | 15 tarefas | Pendente |
| 1 Migracao SQL | -- | Concluida |
| 2 Settings | 4 tarefas | Pendente |
| 3 ClassForm | 4 tarefas | Pendente |
| 4 Automated Billing | 4 tarefas | Pendente |
| 5 Agenda + Prepaid | 6 tarefas | Pendente |
| 6 Cancelamento | 5 tarefas | Pendente |
| 7 Anistia | 3 tarefas | Pendente |
| 8 Consolidacao | 5 grupos | Pendente |

**Ordem recomendada dentro da Fase 0**: 0.1 -> 0.2 -> 0.3 -> 0.5 -> 0.6 -> 0.4 -> 0.9 -> 0.10 -> 0.7 -> 0.8 -> 0.11 -> 0.12

> A logica e: primeiro corrigir o que causa perda financeira silenciosa (status, guards, webhooks, corrupcao), depois blindar acessos (auth), depois refatorar padroes (FK joins, .single()).


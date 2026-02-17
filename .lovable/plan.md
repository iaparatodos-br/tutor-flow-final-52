

# Verificação Final v5.59 — 18 Novas Pontas Soltas (22ª Passagem: Cross-Function Auth Gaps, Cascata de Deleção, Notification Phishing, SDK Inconsistencies)

## Veredicto: Plano atualizado para v5.59 com 8 achados expandindo Fase 0 — smart-delete-student aceita teacher_id do body sem JWT (#452 CRÍTICO IDOR), process-cancellation usa service_role para invocar create-invoice violando autenticação (#453 CRÍTICO), send-student-invitation sem auth permite phishing (#454 CRÍTICO), send-material-shared-notification sem auth permite spam (#455 CRÍTICO), send-class-report-notification .single() 3x em loops (#456 ALTO), send-cancellation-notification .single() em dependentes (#457 MÉDIO), check-subscription-status FK join proibido profiles!teacher_student_relationships_student_id_fkey (#458 ALTO), handle-teacher-subscription-cancellation busca guardian_email inexistente em profiles (#459 MÉDIO), smart-delete-student FK join classes!inner 2x (#460 ALTO), create-dependent persistSession ausente (#461 MÉDIO), delete-dependent não limpa invoice_classes (#462 MÉDIO), create-student .single() em plan lookup (#463 MÉDIO), resend-student-invitation .single() 2x (#464 MÉDIO), create-dependent SDK sem versão fixa (#465 BAIXO), delete-dependent SDK sem versão fixa (#466 BAIXO), handle-teacher-subscription-cancellation referencia RESEND_API_KEY obsoleto (#467 BAIXO), send-cancellation-notification persistSession ausente (#468 MÉDIO), process-cancellation invoca create-invoice via functions.invoke com service_role key (#469 ALTO).

---

## Auditoria de 22ª Passagem (Cross-Function Auth, Cascata de Deleção, Notification Phishing, SDK Inconsistencies)

Funções auditadas nesta rodada (22ª passagem):
- `smart-delete-student/index.ts` — Sem validação JWT, aceita teacher_id do body (#452 CRÍTICO IDOR), FK join `classes!inner` 2x (#460 ALTO)
- `process-cancellation/index.ts` — Invoca create-invoice com SERVICE_ROLE_KEY como Bearer (#453/#469 CRÍTICO), persistSession ausente (#448 já registrado)
- `send-student-invitation/index.ts` — Zero auth, qualquer chamador pode disparar emails de convite com teacher_name arbitrário (#454 CRÍTICO PHISHING)
- `send-material-shared-notification/index.ts` — Zero auth, qualquer chamador pode disparar emails com material_id/student_ids arbitrários, .single() em material/teacher (#455 CRÍTICO)
- `send-class-report-notification/index.ts` — .single() em classData, teacher e reportData (#456 ALTO), zero auth
- `send-cancellation-notification/index.ts` — .single() em dependent lookup dentro de loop (#457 MÉDIO), persistSession ausente (#468 MÉDIO)
- `check-subscription-status/index.ts` — FK join `profiles!teacher_student_relationships_student_id_fkey` (#458 ALTO), .single() 5x em plan lookups (#463 parcial)
- `handle-teacher-subscription-cancellation/index.ts` — Referencia `profiles.guardian_email` inexistente (#459 MÉDIO), .single() em teacher profile (#466 parcial), referencia RESEND_API_KEY obsoleto (#467 BAIXO)
- `create-dependent/index.ts` — SDK sem versão fixa `@supabase/supabase-js@2` (#465 BAIXO), persistSession ausente no supabaseAdmin (#461 MÉDIO)
- `delete-dependent/index.ts` — SDK sem versão fixa (#466 BAIXO), não limpa invoice_classes antes de deletar (#462 MÉDIO)
- `create-student/index.ts` — .single() em plan lookup L297 (#463 MÉDIO)
- `resend-student-invitation/index.ts` — .single() em relationship e student profile L76/L90 (#464 MÉDIO)

### Achados Críticos (→ Fase 0)

1. **#452 (CRÍTICO: IDOR)**: `smart-delete-student` L287 aceita `teacher_id` do body da request sem validar contra `auth.uid()`. Qualquer usuário autenticado pode deletar alunos de qualquer professor passando um teacher_id alheio. Função configurada no config.toml como `verify_jwt = true` (default), mas o código NÃO extrai a identidade do JWT.
2. **#453 (CRÍTICO: AUTH BYPASS)**: `process-cancellation` L454-456 invoca `create-invoice` passando `SUPABASE_SERVICE_ROLE_KEY` como Bearer token. Conforme memória `auth/limite-autenticacao-service-role-edge-functions`, isso falha porque service role key não é JWT de usuário válido para `auth.getUser()`.
3. **#454 (CRÍTICO: PHISHING)**: `send-student-invitation` não possui nenhuma validação de autenticação. Qualquer caller anônimo pode enviar emails de convite com `teacher_name` arbitrário e `invitation_link` malicioso para qualquer endereço de email.
4. **#455 (CRÍTICO: PHISHING/SPAM)**: `send-material-shared-notification` não possui autenticação. Qualquer caller pode disparar emails em massa para qualquer lista de student_ids com material_id arbitrário, usando o sistema como plataforma de spam.
5. **#458 (ALTO: FK JOIN)**: `check-subscription-status` L37 usa FK join proibido `profiles!teacher_student_relationships_student_id_fkey(name, email)` na função `checkNeedsStudentSelection`. Risco de falha silenciosa por cache de schema.
6. **#460 (ALTO: FK JOIN)**: `smart-delete-student` L132-139 e L158-167 usa FK join `classes!inner(teacher_id)` em `checkPendingClasses`. Falha silenciosa impede detecção de aulas pendentes, permitindo deleção prematura.
7. **#469 (ALTO: INVOCAÇÃO CRUZADA)**: `process-cancellation` L451-457 usa `functions.invoke('create-invoice')` com headers de Authorization contendo service_role key. Conforme memória `infrastructure/padrao-comunicacao-interna-edge-functions`, inserção direta via supabaseClient com service_role é preferível.

### Achados Médios/Baixos

8. **#456 (MÉDIO: .single())**: `send-class-report-notification` L37/L49/L74 usa `.single()` em classData, teacher e reportData. Se qualquer registro estiver ausente, toda a batch de notificações falha.
9. **#457 (MÉDIO: .single())**: `send-cancellation-notification` L117 e L277/L374 usa `.single()` em lookup de dependentes dentro de loops de notificação.
10. **#459 (MÉDIO: CAMPO INEXISTENTE)**: `handle-teacher-subscription-cancellation` L263 busca `guardian_email` da tabela `profiles`, mas este campo não existe. Conforme memória `database/responsible-party-contact-teacher-student-relationships`, o email do responsável está em `teacher_student_relationships.student_guardian_email`.
11. **#461 (MÉDIO: persistSession)**: `create-dependent` L37 cria supabaseAdmin sem `{ auth: { persistSession: false } }`.
12. **#462 (MÉDIO: CASCADE)**: `delete-dependent` não limpa `invoice_classes` (que referencia `participant_id` via FK) antes de deletar participações do dependente. Conforme memória `database/student-deletion-cascade-order-bug`, isso pode causar falhas por FK RESTRICT.
13. **#463 (MÉDIO: .single())**: `create-student` L297 usa `.single()` no lookup de `subscription_plans`. Se o plano não existir, a criação do aluno falha com HTTP 500.
14. **#464 (MÉDIO: .single())**: `resend-student-invitation` L76 e L90 usa `.single()` em lookups de relationship e student profile.
15. **#465 (BAIXO: SDK)**: `create-dependent` L2 importa `@supabase/supabase-js@2` sem versão fixa. Risco de breaking changes.
16. **#466 (BAIXO: SDK)**: `delete-dependent` L2 importa `@supabase/supabase-js@2` sem versão fixa.
17. **#467 (BAIXO: OBSOLETO)**: `handle-teacher-subscription-cancellation` L199 verifica `RESEND_API_KEY` (obsoleto), mas usa `sendEmail` (AWS SES). Guarda de notificação pode impedir envio se variável não existir.
18. **#468 (MÉDIO: persistSession)**: `send-cancellation-notification` L37 não configura `{ auth: { persistSession: false } }`.

### Totais Atualizados (v5.59)
- 469 pontas soltas totais | 439 únicas | **427 pendentes**
- Fase 0: **100 itens** (+6: #452, #453, #454, #455, #460, #469)
- **100% cobertura**: 75 funções auditadas (22 passagens)

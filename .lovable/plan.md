



# Verificação Final v5.62 — 18 Novas Pontas Soltas (25ª Passagem: IDOR em Connect Onboarding, Phishing em 4 Notification Functions, FK Joins em Availability/Reminders, ANON_KEY Inline)

## Veredicto: Plano atualizado para v5.62 com 8 achados expandindo Fase 0 — create-connect-onboarding-link aceita stripe_account_id sem ownership validation (#506 CRÍTICO IDOR), send-class-request-notification sem auth phishing (#507 CRÍTICO), send-class-confirmation-notification sem auth phishing (#508 CRÍTICO), send-invoice-notification sem auth leak de dados financeiros (#509 CRÍTICO), get-teacher-availability FK join classes!inner (#510 ALTO), send-class-reminders FK joins class_services + profiles (#511 ALTO), setup-expired-subscriptions-automation ANON_KEY inline (#512 ALTO).

---

## Auditoria de 25ª Passagem (IDOR em Connect Onboarding, Phishing em Notification Functions, FK Joins, ANON_KEY)

Funções auditadas nesta rodada (25ª passagem):
- `create-connect-onboarding-link/index.ts` — IDOR: aceita stripe_account_id sem ownership L53-56 (#506 CRÍTICO), .single() L64 (#521 MÉDIO)
- `send-class-request-notification/index.ts` — SEM AUTH phishing (#507 CRÍTICO), .single() 3x L41/L53/L67 (#517 MÉDIO)
- `send-class-confirmation-notification/index.ts` — SEM AUTH phishing (#508 CRÍTICO), .single() 2x L41/L65 (#518 MÉDIO)
- `send-invoice-notification/index.ts` — SEM AUTH leak financeiro (#509 CRÍTICO), .single() 3x L57/L69/L99 (#519 MÉDIO)
- `get-teacher-availability/index.ts` — FK join classes!inner L87-99 (#510 ALTO)
- `send-class-reminders/index.ts` — FK joins class_services + profiles L30-38/L87-95 (#511 ALTO), .single() 4x em loops L77/L114/L127/L156 (#520 MÉDIO)
- `setup-expired-subscriptions-automation/index.ts` — ANON_KEY inline L31 (#512 ALTO)
- `check-business-profile-status/index.ts` — sem persistSession L28 (#513 MÉDIO), .single() L100 (#523 BAIXO)
- `refresh-stripe-connect-account/index.ts` — sem persistSession L34 (#514 MÉDIO), .single() L66 (#522 MÉDIO)
- `cancel-subscription/index.ts` — .single() L47/L67 (#515 MÉDIO)
- `customer-portal/index.ts` — auditada, sem novos achados
- `list-subscription-invoices/index.ts` — auditada, sem novos achados
- `resend-student-invitation/index.ts` — auditada, bom padrão de auth
- `manage-future-class-exceptions/index.ts` — auditada, bom padrão de auth
- `check-stripe-account-status/index.ts` — auditada, bom padrão

### Achados Críticos (→ Fase 0)

1. **#506 (CRÍTICO: IDOR)**: `create-connect-onboarding-link` L53-56 aceita `stripe_account_id` direto sem ownership validation. Qualquer usuário autenticado pode criar links de onboarding para QUALQUER conta Connect de outro professor.

2. **#507 (CRÍTICO: PHISHING)**: `send-class-request-notification` sem auth. Aceita teacher_id, student_id, notas do body. Emails de solicitação falsos com conteúdo malicioso.

3. **#508 (CRÍTICO: PHISHING)**: `send-class-confirmation-notification` sem auth. Confirmações falsas para alunos/responsáveis.

4. **#509 (CRÍTICO: LEAK)**: `send-invoice-notification` sem auth. Aceita invoice_id → acessa dados financeiros completos via service_role. Enumeração de faturas + envio de links de pagamento reais para endereços arbitrários.

5. **#510 (ALTO: FK JOIN)**: `get-teacher-availability` FK join classes!inner → crash de disponibilidade para alunos.

6. **#511 (ALTO: FK JOIN)**: `send-class-reminders` FK joins class_services + profiles → crash do cron de lembretes.

7. **#512 (ALTO: ANON_KEY)**: `setup-expired-subscriptions-automation` ANON_KEY inline no SQL.

### Padrão Sistêmico: 8 de 9 Notification Functions sem Auth

Confirmado que apenas `resend-student-invitation` tem auth adequada. Todas as demais são vetores de phishing/leak.

### Totais Atualizados (v5.62)
- 523 pontas soltas totais | 493 únicas | **481 pendentes**
- Fase 0: **124 itens** (+8: #506, #507, #508, #509, #510, #511, #512)
- **100% cobertura**: 75 funções auditadas (25 passagens)

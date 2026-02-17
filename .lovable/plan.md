




# Verificação Final v5.65 — 18 Novas Pontas Soltas (28ª Passagem: handle-teacher-subscription-cancellation IDOR + PII Leak, stripe-events-monitor e validate-business-profile-deletion sem Auth, Audit Schema Mismatch Confirmado, IDOR em refresh-stripe-connect-account, archive-old-data FK Cascade + Dados Corrompidos)

## Veredicto: Plano atualizado para v5.65 com 13 achados expandindo Fase 0 — handle-teacher-subscription-cancellation sem auth IDOR (#564 CRÍTICO), guardian_email fantasma (#565 ALTO), sem guard clause (#566 ALTO), stripeAccount missing (#567 ALTO), .single() (#577 ALTO), status não-padrão (#578 ALTO); handle-plan-downgrade-selection audit schema mismatch (#568 ALTO); stripe-events-monitor sem auth (#572 CRÍTICO); validate-business-profile-deletion sem auth (#573 CRÍTICO); refresh-stripe-connect-account IDOR (#574 ALTO); send-class-report-notification .single() 6x + sem auth (#575, #576 ALTO); archive-old-data student_id fantasma + FK cascade (#580, #581 ALTO).

---

## Auditoria de 28ª Passagem (Auth Missing em Funções de Administração, Audit Schema Mismatch, IDOR, FK Cascade)

Funções auditadas nesta rodada (28ª passagem):
- `handle-teacher-subscription-cancellation/index.ts` — sem auth IDOR (#564 CRÍTICO), guardian_email fantasma L263 (#565 ALTO), sem guard clause L140-146 (#566 ALTO), missing stripeAccount L122 (#567 ALTO), .single() L252 (#577 ALTO), status não-padrão L143 (#578 ALTO)
- `handle-plan-downgrade-selection/index.ts` — audit_logs schema mismatch L29-37 (#568 ALTO), .single() L111 (#569 ALTO)
- `stripe-events-monitor/index.ts` — sem auth (#572 CRÍTICO)
- `validate-business-profile-deletion/index.ts` — sem auth (#573 CRÍTICO)
- `send-class-report-notification/index.ts` — 6x .single() em loop (#575 ALTO), sem auth (#576 ALTO)
- `refresh-stripe-connect-account/index.ts` — IDOR em payment_accounts L119 (#574 ALTO)
- `check-business-profile-status/index.ts` — sem persistSession L27 (#570 MÉDIO), .single() L77/L100 (#571 ALTO), Stripe SDK v14.24.0 (#579 MÉDIO)
- `archive-old-data/index.ts` — student_id fantasma L132 (#580 ALTO), FK cascade failure (#581 ALTO)

### Achados Críticos (→ Fase 0 URGENTE)

1. **#564 (CRÍTICO: IDOR)**: `handle-teacher-subscription-cancellation` sem auth. Aceita `teacher_id` do body → qualquer pessoa cancela faturas de qualquer professor.

2. **#572 (CRÍTICO: DATA EXPOSURE)**: `stripe-events-monitor` sem auth. Expõe metadados de processamento de eventos Stripe.

3. **#573 (CRÍTICO: PII/FINANCIAL)**: `validate-business-profile-deletion` sem auth. Retorna dados de faturas e relacionamentos para qualquer business_profile_id.

### Achados Altos (→ Fase 0)

4. **#565**: guardian_email fantasma em handle-teacher-subscription-cancellation
5. **#566**: sem guard clause em UPDATE de status
6. **#567**: stripeAccount missing em Stripe retrieve
7. **#568**: audit_logs schema mismatch confirmado
8. **#574**: IDOR em payment_accounts (refresh-stripe-connect-account)
9. **#575**: 6x .single() em loop (send-class-report-notification)
10. **#576**: 10ª função de notificação sem auth
11. **#577**: .single() em teacher lookup (sendNotifications)
12. **#578**: status não-padrão 'cancelada_por_professor_inativo'
13. **#580**: student_id fantasma em archive-old-data (dados corrompidos)
14. **#581**: FK cascade failure em archive-old-data

### Totais Atualizados (v5.65)
- 577 pontas soltas totais | 547 únicas | **535 pendentes**
- Fase 0: **162 itens** (+13: #564, #565, #566, #567, #568, #572, #573, #574, #575, #576, #577, #578, #580, #581)
- **100% cobertura**: 75 funções auditadas (28 passagens)

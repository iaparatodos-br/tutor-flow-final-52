



# Verificação Final v5.54 — 15 Novas Pontas Soltas (17ª Passagem: Subscrições do Professor, Stripe Connect, Notificações)

## Veredicto: Plano atualizado para v5.54 com 5 achados CRÍTICOS — send-student-invitation sem auth (#372 SEGURANÇA), send-class-report-notification sem auth (#373 SEGURANÇA), send-material-shared-notification sem auth (#374 SEGURANÇA), cancel-subscription crash (#369), e FK join + .single() em checkout (#371).

---

## Auditoria de 17ª Passagem (Subscrições do Professor, Stripe Connect, Notificações de Relatório/Material/Convite/Confirmação/Boleto)

Funções auditadas nesta rodada (17ª passagem):
- `cancel-subscription/index.ts` — `.single()` L67 (#369 ALTA)
- `create-subscription-checkout/index.ts` — `.single()` L138 (#370), FK join L172 (#371 ALTA)
- `send-student-invitation/index.ts` — SEM AUTH (#372 ALTA SEGURANÇA)
- `send-class-report-notification/index.ts` — SEM AUTH (#373 ALTA), `.single()` 3x (#377)
- `send-material-shared-notification/index.ts` — SEM AUTH (#374 ALTA), `.single()` 2x (#375)
- `send-cancellation-notification/index.ts` — sem persistSession (#376)
- `send-class-confirmation-notification/index.ts` — `.single()` 3x (#378)
- `send-boleto-subscription-notification/index.ts` — serve() duplicado (#380), `.single()` (#379)
- `create-connect-account/index.ts` — `.single()` (#381)
- `create-connect-onboarding-link/index.ts` — bypass ownership (#382)
- `refresh-stripe-connect-account/index.ts` — dual-client (#383)

### Achados Críticos (→ Fase 0)

1. **#372 (SEGURANÇA: PHISHING)**: `send-student-invitation` sem autenticação — permite emails de phishing com links maliciosos usando nome de qualquer professor.
2. **#373 (SEGURANÇA: RELATÓRIO)**: `send-class-report-notification` sem auth — expõe dados de relatórios.
3. **#374 (SEGURANÇA: MATERIAL)**: `send-material-shared-notification` sem auth — permite spam e exposição de dados.
4. **#369**: `cancel-subscription` crash por `.single()` em race condition com webhook.
5. **#371**: `create-subscription-checkout` FK join proibido + `.single()` em assinaturas existentes.

### Totais Atualizados (v5.54)
- 383 pontas soltas totais | 353 únicas | **341 pendentes**
- Fase 0: **66 itens** (+5: #369, #371, #372, #373, #374)
- **100% cobertura**: 75 funções auditadas (17 passagens)

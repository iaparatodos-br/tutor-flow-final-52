


# Verificação Final v5.43 — 9 Novas Pontas Soltas (6ª Passagem: Subscription Management, Payment Flows e Connect)

## Veredicto: Plano atualizado para v5.43 com 2 bugs ALTOS adicionais (cancel-payment-intent escreve status em inglês, e handle-plan-downgrade-selection tem audit logs quebrados).

---

## Auditoria de 6ª Passagem (Subscription Management, Payment Flows e Connect — Análise Cruzada)

Funções auditadas nesta rodada (6ª passagem):
- `cancel-subscription/index.ts` (118 linhas) — `.single()` em profiles e user_subscriptions, mas com handling
- `create-subscription-checkout/index.ts` (372 linhas) — `.single()` em subscription_plans (#265)
- `handle-plan-downgrade-selection/index.ts` (323 linhas) — **ALTO: audit logs com colunas erradas** (#258), **MÉDIA: não conta dependentes** (#264), `.single()` (#265)
- `handle-teacher-subscription-cancellation/index.ts` (304 linhas) — `.single()` em notifications (não-crítico)
- `refresh-stripe-connect-account/index.ts` (150 linhas) — OK (ownership validada)
- `validate-payment-routing/index.ts` (321 linhas) — **MÉDIA: cria fatura real como teste** (#259), FK joins (#266)
- `verify-payment-status/index.ts` (124 linhas) — **CONFIRMAÇÃO #195: sem auth** (#260)
- `change-payment-method/index.ts` (253 linhas) — **CONFIRMAÇÃO #196: double .eq()** (#261)
- `cancel-payment-intent/index.ts` (250 linhas) — **ALTO: status 'paid' (inglês) — extensão #237** (#262)
- `create-connect-account/index.ts` (148 linhas) — OK (ownership validada)
- `create-connect-onboarding-link/index.ts` (104 linhas) — **MÉDIA: IDOR quando stripe_account_id direto** (#263)
- `customer-portal/index.ts` (75 linhas) — busca por email frágil (já coberto #147)

### Novos Gaps Encontrados (#258-#266)

1. **#258 (ALTA → Fase 0)**: `handle-plan-downgrade-selection` insere audit_logs com colunas ERRADAS (`user_id`, `action`, `details`, `metadata`). A tabela `audit_logs` tem `actor_id`, `operation`, `table_name`, `record_id`, `old_data`, `new_data`. **Todas as 3 escritas de audit silenciosamente falham** — zero trilha de auditoria para downgrades de plano.

2. **#259 (MÉDIA)**: `validate-payment-routing` (L245-249) cria uma fatura REAL no banco como "teste", depois tenta deletar por description. Se crash entre insert e delete → fatura órfã em produção. Delete por description é frágil e pode apagar faturas legítimas.

3. **#260 (CONFIRMAÇÃO de #195)**: `verify-payment-status` não valida identidade. Qualquer JWT pode consultar e ATUALIZAR o status de qualquer fatura. Pode reverter `'paga'` para `'falha_pagamento'`.

4. **#261 (CONFIRMAÇÃO de #196)**: `change-payment-method` L83-86 `.eq('responsible_id', invoice.student_id).eq('responsible_id', user.id)` — PostgREST usa o ÚLTIMO `.eq()`, tornando a verificação de guardian completamente inoperante. Qualquer usuário com dependente pode acessar qualquer fatura.

5. **#262 (ALTA → Fase 0 — extensão de #237)**: `cancel-payment-intent` escreve `status: 'paid'` (inglês) nas linhas 112 e 172 em vez de `'paga'` (português). Faturas confirmadas manualmente ficam invisíveis no módulo financeiro. Mesmo bug que #237 mas em função diferente.

6. **#263 (MÉDIA)**: `create-connect-onboarding-link` L53-56 — quando `stripe_account_id` é fornecido diretamente, a função pula completamente a validação de ownership. IDOR: atacante pode gerar link de onboarding para qualquer conta Stripe.

7. **#264 (MÉDIA)**: `handle-plan-downgrade-selection` L134 valida `selected_student_ids.length` contra `student_limit` mas NÃO conta dependentes dos alunos selecionados. Professor pode exceder o limite do plano.

8. **#265 (MÉDIA)**: Múltiplas funções usam `.single()` sem handling gracioso: cancel-subscription L47/L67, create-subscription-checkout L138, handle-plan-downgrade-selection L111, create-connect-onboarding-link L64.

9. **#266 (BAIXA)**: `validate-payment-routing` usa FK join syntax (L102-116: `profiles:student_id(...)`) violando a constraint de queries sequenciais.

### Totais Atualizados (v5.43)
- 266 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 6 confirmações (#246→#196, #247→#181, #252→#109, #254→#138, #260→#195, #261→#196)
- 238 únicas (descontando confirmações)
- 10 implementadas
- **226 pendentes**
- Fase 0: **28 itens** (+2: #258, #262)
- **100% cobertura**: 75 funções auditadas (6 passagens completas)

### Status Final
O documento está **pronto para execução da Fase 0** com 28 itens críticos. Prioridade: #237+#262 (status 'paid' vs 'paga' — 5 linhas total em 2 funções) → #243 (1 guard) → #258 (reescrever 3 audit calls) → #251 (3 guards) → #250 (3× .maybeSingle()) → #256/#257 (catch blocks).




# Verificação Final v5.34 — 3 Novas Pontas Soltas em Funções Stripe Connect e Autorização

## Veredicto: Plano atualizado para v5.34 com 1 bug funcional crítico de autorização.

---

## Auditoria Profunda Realizada (Funções Stripe Connect & Autorização)

Funções auditadas nesta rodada:
- `change-payment-method/index.ts` (253 linhas) — bug de sobreposição `.eq()` em guardian auth
- `create-connect-onboarding-link/index.ts` (104 linhas) — bypass de ownership
- `refresh-stripe-connect-account/index.ts` (150 linhas) — `.single()`
- `check-stripe-account-status/index.ts` (156 linhas) — `.single()`
- `create-connect-account/index.ts` (148 linhas) — confirmação de #143
- `customer-portal/index.ts` (75 linhas) — OK
- `list-subscription-invoices/index.ts` (120 linhas) — OK

### Novos Gaps Encontrados (#196-#198)

1. **#196 (ALTA → Fase 0)**: `change-payment-method` possui bug de sobreposição de `.eq('responsible_id', ...)` em linhas 83-86. Dois filtros consecutivos na mesma coluna — PostgREST aplica apenas o último. Resultado: **a verificação de guardian é SEMPRE falsa**. Responsáveis financeiros nunca conseguem alterar o método de pagamento de faturas de seus dependentes.

2. **#197 (MÉDIA)**: `create-connect-onboarding-link` pula validação de propriedade quando `stripe_account_id` é fornecido diretamente (linhas 53-56). Qualquer professor autenticado pode gerar links de onboarding para contas Stripe de outros professores.

3. **#198 (BAIXA)**: `refresh-stripe-connect-account` e `check-stripe-account-status` usam `.single()` para lookups de Connect account, violando padrão `.maybeSingle()`.

### Totais Atualizados (v5.34)
- 198 pontas soltas totais
- 18 duplicatas + 2 subsumidas
- 178 únicas
- 10 implementadas
- **168 pendentes**
- Fase 0: **11 itens** (+1: #196)

### Status Final
O documento está **pronto para execução da Fase 0** com 11 itens críticos.





# Verificação Final v5.40 — 6 Novas Pontas Soltas em Webhooks, Cron Jobs e Subscrições

## Veredicto: Plano atualizado para v5.40 com 1 bug CRÍTICO (webhook status 'paid' corrompe TODOS os pagamentos automáticos) e 1 bug ALTO (retries desnecessários do Stripe).

---

## Auditoria de 3ª Passagem (Webhooks + Cron Jobs + Subscrições)

Funções auditadas nesta rodada (3ª passagem — análise em profundidade):
- `webhook-stripe-connect/index.ts` (560 linhas) — **CRÍTICO: status `"paid"` em 3 handlers** (#237)
- `webhook-stripe-subscriptions/index.ts` (802 linhas) — **HTTP 400/500 causa retries do Stripe** (#238)
- `automated-billing/index.ts` (1057 linhas) — OK (FK joins nomeados, status 'pendente' correto)
- `generate-boleto-for-invoice/index.ts` (187 linhas) — **Sem ownership validation** (#242)
- `process-payment-failure-downgrade/index.ts` (280 linhas) — Confirma #109 (params errados smart-delete)
- `handle-student-overage/index.ts` (238 linhas) — OK (interno, `.single()` já coberto)
- `smart-delete-student/index.ts` (547 linhas) — **Sem ownership validation** (#240)
- `check-subscription-status/index.ts` (846 linhas) — **Monolito com 6+ `.single()`** (#241)
- `create-subscription-checkout/index.ts` (372 linhas) — Confirma #216 (cancelamento prematuro)
- `process-expired-subscriptions/index.ts` (233 linhas) — **FK joins em cron** (#239)

### Novos Gaps Encontrados (#237-#242)

1. **#237 (CRÍTICA → Fase 0)**: `webhook-stripe-connect` usa `status: "paid"` em 3 handlers: `invoice.paid` (L320), `invoice.payment_succeeded` (L357), `payment_intent.succeeded` (L469). **Este é o finding mais grave de toda a auditoria** — corrompe TODOS os pagamentos automáticos, tornando-os invisíveis ao sistema financeiro.

2. **#238 (ALTA → Fase 0)**: `webhook-stripe-subscriptions` retorna HTTP 400/500 para "User not found" (linhas 427, 519, 572, 608, 715). Stripe retenta webhooks com resposta não-200, causando carga desnecessária e risco de duplicação.

3. **#239 (MÉDIA)**: `process-expired-subscriptions` usa FK joins `subscription_plans!inner` e `profiles!user_id` em cron job. Schema cache obsoleto impede processamento de todas as assinaturas expiradas.

4. **#240 (MÉDIA)**: `smart-delete-student` aceita `teacher_id` do body sem validar contra JWT. Qualquer professor autenticado pode deletar alunos de outro professor.

5. **#241 (BAIXA)**: `check-subscription-status` monolito de 846 linhas com 6+ `.single()` em lookups de planos. Parcialmente coberto por #217.

6. **#242 (MÉDIA)**: `generate-boleto-for-invoice` sem ownership validation. Qualquer usuário autenticado pode gerar boleto para qualquer fatura, expondo CPF e endereço do pagador.

### Totais Atualizados (v5.40)
- 242 pontas soltas totais
- 18 duplicatas + 2 subsumidas
- 222 únicas
- 10 implementadas
- **212 pendentes**
- Fase 0: **21 itens** (+2: #237, #238)
- **100% cobertura**: 75 funções auditadas (3ª passagem em 10 funções de webhook/cron/subscrição)

### Impacto do #237 (Resumo Executivo)
O bug #237 é o mais grave porque afeta o **fluxo principal de receita**: quando um aluno paga uma fatura via Stripe (PIX, boleto ou cartão), o webhook marca a fatura como `"paid"` (inglês). O sistema financeiro inteiro filtra por `"paga"` (português). Resultado:
- Faturas pagas aparecem como "pendentes" no dashboard do professor
- O cron `check-overdue-invoices` pode marcá-las como "vencidas" e enviar cobranças duplicadas
- O professor não vê que recebeu o pagamento
- Relatórios financeiros estão subcontados

### Status Final
O documento está **pronto para execução da Fase 0** com 21 itens críticos. A prioridade absoluta é o #237 (3 linhas de código a mudar) que resolve o bug de corrupção financeira mais impactante.

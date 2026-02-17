


# Verificação Final v5.58 — 18 Novas Pontas Soltas (21ª Passagem: Status Mismatch Sistêmico, Destruição de Dados de Pagamento, Webhook Resilience, FK Joins Core)

## Veredicto: Plano atualizado para v5.58 com 7 achados CRÍTICOS — webhook-stripe-connect usa status em INGLÊS ('paid'/'overdue') em vez de Português ('paga'/'vencida') (#434 CATASTRÓFICO), cancel-payment-intent idem (#435), check-overdue-invoices idem (#436), webhook-stripe-connect destrói dados de comprovante após pagamento (#437 INTEGRIDADE), webhook-stripe-connect retorna HTTP 500 no catch (#438 RESILIÊNCIA), automated-billing sem idempotência de mensalidade (#451 INTEGRIDADE).

---

## Auditoria de 21ª Passagem (Status Mismatch Sistêmico, Destruição de Dados, Webhook Resilience, FK Joins em Funções Core)

Funções auditadas nesta rodada (21ª passagem):
- `webhook-stripe-connect/index.ts` — Status em INGLÊS (#434 CATASTRÓFICO), destrói dados de pagamento (#437 CRÍTICO), HTTP 500 no catch (#438 RESILIÊNCIA), sem guard clause em payment_failed/uncollectible (#449), `.single()` 3x (#444)
- `cancel-payment-intent/index.ts` — Status 'paid' em vez de 'paga' (#435 CRÍTICO), persistSession ausente (#447), `.single()` (#444)
- `check-overdue-invoices/index.ts` — Status 'overdue' em vez de 'vencida' (#436 CRÍTICO), class_notifications errado (#confirmed), sem guard clause (#confirmed)
- `create-payment-intent-connect/index.ts` — FK join proibido 3x (#439 ALTO), `.single()` (#444), sem auth (#confirmed)
- `automated-billing/index.ts` — FK join `profiles!teacher_id`/`profiles!student_id` (#440 ALTO), FK join `classes!inner` (#441 ALTO), sem idempotência de mensalidade (#451 INTEGRIDADE)
- `create-invoice/index.ts` — FK join `classes!inner` (#442 ALTO), FK join em relationship (#443 ALTO), boleto_url→stripe_hosted_invoice_url (#450 MÉDIO)
- `process-cancellation/index.ts` — persistSession ausente (#448), `.single()` em dependentes (#446)
- `send-invoice-notification/index.ts` — `.single()` 4x (#445)

### Achados Críticos (→ Fase 0)

1. **#434 (CATASTRÓFICO: STATUS MISMATCH)**: `webhook-stripe-connect` L320/L356/L469 usa `status: 'paid'` em vez de `'paga'` e L404 usa `'overdue'` em vez de `'vencida'`. **Todos os pagamentos confirmados via Stripe ficam INVISÍVEIS no dashboard**. Faturas nunca são reconhecidas como pagas pelo sistema.
2. **#435 (CRÍTICO: STATUS MISMATCH)**: `cancel-payment-intent` L172 usa `status: 'paid'` em vez de `'paga'`. Confirmações manuais de pagamento ficam invisíveis.
3. **#436 (CRÍTICO: STATUS MISMATCH)**: `check-overdue-invoices` L58 usa `status: 'overdue'` em vez de `'vencida'`. Faturas vencidas ficam com status não reconhecido.
4. **#437 (CRÍTICO: DESTRUIÇÃO DE DADOS)**: `webhook-stripe-connect` L474-481 limpa TODOS os dados de pagamento (boleto_url, pix_copy_paste, stripe_hosted_invoice_url) ao processar `payment_intent.succeeded`. Alunos perdem acesso a comprovantes e links de pagamento após confirmação.
5. **#438 (CRÍTICO: WEBHOOK RESILIENCE)**: `webhook-stripe-connect` L555 retorna HTTP 500 no catch block. Stripe retenta indefinidamente, causando storms de reprocessamento.
6. **#439 (ALTO: FK JOIN)**: `create-payment-intent-connect` L41-48 usa FK join proibido (`profiles!invoices_student_id_fkey`, `business_profiles!invoices_business_profile_id_fkey`).
7. **#440 (ALTO: FK JOIN)**: `automated-billing` L72-89 usa FK join `profiles!teacher_id` e `profiles!student_id` na query de relacionamentos.
8. **#441 (ALTO: FK JOIN)**: `automated-billing` L214-226 usa FK join `classes!inner` na verificação de aulas confirmadas antigas.
9. **#442 (ALTO: FK JOIN)**: `create-invoice` L233 usa FK join `classes!inner` para buscar dados de class_participants.
10. **#443 (ALTO: FK JOIN)**: `create-invoice` L148 usa FK join `business_profiles!teacher_student_relationships_business_profile_id_fkey`.
11. **#444 (MÉDIO: .single())**: `webhook-stripe-connect` L306/L343/L453 e `cancel-payment-intent` L71 usam `.single()` em lookups de fatura — record ausente causa crash.
12. **#445 (MÉDIO: .single())**: `send-invoice-notification` L57/L68/L99/L161 usa `.single()` 4x — qualquer registro ausente crashea toda a notificação.
13. **#446 (MÉDIO: .single())**: `process-cancellation` e `send-cancellation-notification` usam `.single()` em lookups de dependentes dentro de loops.
14. **#447 (MÉDIO: persistSession)**: `cancel-payment-intent` L37 não configura `{ auth: { persistSession: false } }`.
15. **#448 (MÉDIO: persistSession)**: `process-cancellation` L30 não configura `{ auth: { persistSession: false } }`.
16. **#449 (MÉDIO: Guard Clause)**: `webhook-stripe-connect` handlers de `invoice.payment_failed` (L380) e `invoice.marked_uncollectible` (L401) não possuem guard clause — podem reverter status `'paga'`.
17. **#450 (MÉDIO: CTA Enganoso)**: `create-invoice` L443 copia `boleto_url` para `stripe_hosted_invoice_url`, fazendo emails de notificação rotularem boleto como "Cartão de Crédito".
18. **#451 (CRÍTICO: IDEMPOTÊNCIA)**: `automated-billing` processMonthlySubscriptionBilling (L814-819) não verifica existência de fatura de mensalidade no ciclo atual. Múltiplas execuções do cron geram faturas duplicadas.

### Totais Atualizados (v5.58)
- 451 pontas soltas totais | 421 únicas | **409 pendentes**
- Fase 0: **94 itens** (+8: #434, #435, #436, #437, #438, #439, #440, #451)
- **100% cobertura**: 75 funções auditadas (21 passagens)

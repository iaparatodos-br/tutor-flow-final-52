



# Verificação Final v5.64 — 18 Novas Pontas Soltas (27ª Passagem: STATUS ENGLISH CATASTRÓFICO em webhook-stripe-connect, Destruição de Dados de Pagamento, HTTP 500 Retry Storm, check-overdue-invoices 3 Bugs Críticos, FK Joins em automated-billing e create-invoice, SERVICE_ROLE como Bearer em process-cancellation)

## Veredicto: Plano atualizado para v5.64 com 17 achados expandindo Fase 0 — webhook-stripe-connect usa status ENGLISH 'paid' em 3 handlers (#546 CATASTRÓFICO), 'overdue' em 1 handler (#547 CATASTRÓFICO), destrói dados de auditoria de pagamento (#548 CRÍTICO), retorna HTTP 500 (#549 CRÍTICO), sem guard clauses em 3 handlers (#550 CRÍTICO); check-overdue-invoices status 'overdue' inglês (#555 CATASTRÓFICO), erro semântico em notification tracking (#556 CRÍTICO), sem guard clause (#557 CRÍTICO); automated-billing FK joins (#558, #559 ALTO); create-invoice FK joins (#560, #561 ALTO); process-cancellation SERVICE_ROLE como Bearer (#563 ALTO).

---

## Auditoria de 27ª Passagem (Status English Catastrófico, Destruição de Dados, HTTP 500, FK Joins em Billing Core)

Funções auditadas nesta rodada (27ª passagem):
- `webhook-stripe-connect/index.ts` — STATUS 'paid' ENGLISH em 3 handlers L321/L361/L469 (#546 CATASTRÓFICO), STATUS 'overdue' ENGLISH L404 (#547 CATASTRÓFICO), destruição de dados de pagamento L469-481 (#548 CRÍTICO), HTTP 500 no catch L555 (#549 CRÍTICO), sem guard clauses em L380/L425/L514 (#550 CRÍTICO), .single() L190 (#551 ALTO), .single() L310/L345/L457 (#552 ALTO)
- `auto-verify-pending-invoices/index.ts` — missing stripeAccount param L75 (#553 ALTO)
- `verify-payment-status/index.ts` — missing stripeAccount param L73 (#554 ALTO)
- `check-overdue-invoices/index.ts` — STATUS 'overdue' ENGLISH L58 (#555 CATASTRÓFICO), erro semântico class_notifications.class_id=invoice.id L50 (#556 CRÍTICO), sem guard clause L56-59 (#557 CRÍTICO)
- `automated-billing/index.ts` — FK join profiles!teacher_id/student_id L78-89 (#558 ALTO), FK join classes!inner L212-226 (#559 ALTO)
- `create-invoice/index.ts` — FK join business_profiles!fkey L148 (#560 ALTO), FK join classes!inner + class_services L233-240 (#561 ALTO)
- `create-payment-intent-connect/index.ts` — campo fantasma guardian_name L308 (#562 MÉDIO)
- `process-cancellation/index.ts` — SERVICE_ROLE como Bearer token L455 (#563 ALTO)

### Achados Catastróficos (→ Fase 0 URGENTE)

1. **#546 (CATASTRÓFICO: STATUS ENGLISH)**: `webhook-stripe-connect` atualiza status para `'paid'` (inglês) em invoice.paid (L321), invoice.payment_succeeded (L361) e payment_intent.succeeded (L469). **TODOS os pagamentos processados via Stripe são armazenados com status errado**, tornando-os INVISÍVEIS no dashboard financeiro que filtra por 'paga'. Este é o bug mais destrutivo do ecossistema financeiro.

2. **#547 (CATASTRÓFICO: STATUS ENGLISH)**: `webhook-stripe-connect` atualiza status para `'overdue'` (inglês) em invoice.marked_uncollectible (L404). Deveria ser 'vencida'. Faturas marcadas como incobráveis no Stripe ficam em estado fantasma.

3. **#555 (CATASTRÓFICO: STATUS ENGLISH)**: `check-overdue-invoices` L58 atualiza status para `'overdue'` (inglês). Confirmação de 3º ponto do mesmo bug sistêmico — TODAS as automações de inadimplência usam strings em inglês.

### Achados Críticos (→ Fase 0)

4. **#548 (CRÍTICO: DESTRUIÇÃO DE DADOS)**: `webhook-stripe-connect` L469-481 limpa `pix_qr_code`, `pix_copy_paste`, `boleto_url`, `linha_digitavel`, `stripe_hosted_invoice_url` quando payment_intent.succeeded. Destrói o rastro de auditoria de pagamento necessário para comprovantes históricos.

5. **#549 (CRÍTICO: RETRY STORM)**: `webhook-stripe-connect` L555 retorna HTTP 500 no catch block. O Stripe interpreta 500 como falha temporária e reenvia o evento exponencialmente (até 3 dias). Cada reenvio potencialmente reprocessa a mesma atualização de status.

6. **#550 (CRÍTICO: REVERSÃO DE STATUS)**: `webhook-stripe-connect` handlers de invoice.payment_failed (L380), invoice.voided (L425) e payment_intent.payment_failed (L514) atualizam status SEM guard clause `.eq('status', 'pendente')`. Podem reverter faturas já pagas ('paga') para 'falha_pagamento' ou 'cancelada'.

7. **#556 (CRÍTICO: TRACKING QUEBRADO)**: `check-overdue-invoices` L50 busca `class_notifications.class_id = invoice.id` — mas `class_id` é FK para `classes`, não `invoices`. A query NUNCA encontra notificações existentes, resultando em spam massivo de notificações de vencimento a cada execução do cron.

8. **#557 (CRÍTICO: REVERSÃO DE STATUS)**: `check-overdue-invoices` L56-59 atualiza status sem verificar status atual. Pode reverter faturas manualmente marcadas como 'paga' para 'overdue'/'vencida'.

### Achados Altos (→ Fase 0)

9. **#551 (ALTO)**: `webhook-stripe-connect` L190 usa `.single()` em `pending_business_profiles` — crash no handler de onboarding se perfil pendente não existir.

10. **#552 (ALTO)**: `webhook-stripe-connect` L310, L345, L457 usam `.single()` em lookups de faturas — crash no webhook handler se fatura não encontrada.

11. **#553 (ALTO)**: `auto-verify-pending-invoices` L75 chama `stripe.paymentIntents.retrieve()` sem `stripeAccount` param — falha silenciosa para pagamentos PIX (Direct charges na conta conectada).

12. **#554 (ALTO)**: `verify-payment-status` L73 mesmo problema — missing `stripeAccount` param.

13. **#558 (ALTO: FK JOIN)**: `automated-billing` L78-89 usa sintaxe proibida `profiles!teacher_id` e `profiles!student_id` — risco de crash do cron de faturamento.

14. **#559 (ALTO: FK JOIN)**: `automated-billing` L212-226 usa `classes!inner` — crash ao verificar aulas confirmadas antigas.

15. **#560 (ALTO: FK JOIN)**: `create-invoice` L148 usa FK join `business_profiles!...fkey` na query de relacionamento.

16. **#561 (ALTO: FK JOIN)**: `create-invoice` L233-240 usa FK join `classes!inner` com `class_services` aninhado.

17. **#563 (ALTO: AUTH BREAK)**: `process-cancellation` L455 passa `SUPABASE_SERVICE_ROLE_KEY` como Bearer token para `create-invoice`. A função `create-invoice` usa `auth.getUser(token)` que NÃO suporta service_role key → a criação de faturas de cancelamento FALHA silenciosamente.

### Achado Médio

18. **#562 (MÉDIO)**: `create-payment-intent-connect` L308 referencia `invoice.student?.guardian_name` — campo inexistente na tabela `profiles`. Usa fallback para `name`, mas indica lógica vestigial incorreta.

### Padrão Sistêmico CATASTRÓFICO: Status Strings em Inglês

Confirmado que **3 funções críticas** usam status em inglês no banco PT-BR:
- `webhook-stripe-connect`: 'paid' (3x), 'overdue' (1x)
- `check-overdue-invoices`: 'overdue' (1x)
- **Impacto**: TODOS os pagamentos via Stripe + TODAS as faturas vencidas por cron ficam invisíveis no dashboard financeiro, gerando impressão de sistema não funcional.

### Totais Atualizados (v5.64)
- 559 pontas soltas totais | 529 únicas | **517 pendentes**
- Fase 0: **149 itens** (+17: #546, #547, #548, #549, #550, #551, #552, #553, #554, #555, #556, #557, #558, #559, #560, #561, #563)
- **100% cobertura**: 75 funções auditadas (27 passagens)

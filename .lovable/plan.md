

# Verificação Final v5.60 — 18 Novas Pontas Soltas (23ª Passagem: Webhook Status Guards, stripeAccount Missing, RPC Inexistente, Notification Spam Loops)

## Veredicto: Plano atualizado para v5.60 com 8 achados expandindo Fase 0 — webhook-stripe-connect retorna HTTP 500 em handlers de invoice (#472 CRÍTICO), sem status guard em invoice.payment_failed (#473 CRÍTICO) e payment_intent.payment_failed (#474 CRÍTICO), process-cancellation chama RPC inexistente teacher_has_financial_module (#481 CRÍTICO), webhook .single() em pending_business_profiles (#470 ALTO) e payment_origin lookups (#471 ALTO), automated-billing invoca create-payment-intent-connect sem Auth header (#475 ALTO), check-overdue-invoices FK semântico class_notifications.class_id=invoice.id (#479 ALTO), sem tracking insert causando spam infinito (#480 ALTO), cancel-payment-intent sem stripeAccount (#476 ALTO), verify-payment-status IDOR (#482 ALTO) e sem stripeAccount (#483 ALTO), auto-verify-pending-invoices sem stripeAccount (#484 ALTO) e sem status guard (#485 MÉDIO), automated-billing FK join subscription_plans!inner (#486 ALTO), invoice.voided sem status guard (#487 ALTO), process-cancellation .single() em dependent (#478 MÉDIO), cancel-payment-intent persistSession ausente (#477 MÉDIO).

---

## Auditoria de 23ª Passagem (Webhook Status Guards, stripeAccount Missing, RPC Inexistente, Notification Spam Loops)

Funções auditadas nesta rodada (23ª passagem):
- `webhook-stripe-connect/index.ts` — .single() L190 em pending_business_profiles (#470 ALTO), .single() L310/L346/L457 em payment_origin lookups (#471 ALTO), HTTP 500 em invoice.paid L328 e marked_uncollectible L410 (#472 CRÍTICO), invoice.payment_failed L380 sem status guard (#473 CRÍTICO), payment_intent.payment_failed L514 sem status guard (#474 CRÍTICO), invoice.voided L425 sem status guard (#487 ALTO)
- `automated-billing/index.ts` — Invoca create-payment-intent-connect L522/L850 sem Authorization header (#475 ALTO), FK join subscription_plans!inner L1034 em validateTeacherCanBill (#486 ALTO)
- `cancel-payment-intent/index.ts` — Cancela PI L139 sem stripeAccount param (#476 ALTO), persistSession ausente L37 (#477 MÉDIO)
- `process-cancellation/index.ts` — .single() L107 em dependent lookup (#478 MÉDIO), chama RPC inexistente teacher_has_financial_module L377 (#481 CRÍTICO)
- `check-overdue-invoices/index.ts` — FK semântico: class_notifications.class_id = invoice.id L50/L103 (#479 ALTO), sem inserção de tracking após envio L54-67/L100-114 causando spam infinito (#480 ALTO)
- `verify-payment-status/index.ts` — IDOR: sem validação auth.uid() L32-40 (#482 ALTO), retrieves PI L73 sem stripeAccount (#483 ALTO)
- `auto-verify-pending-invoices/index.ts` — Retrieves PI L75 sem stripeAccount (#484 ALTO), sem status guard L91-98 permite reverter 'paga' (#485 MÉDIO)

### Achados Críticos (→ Fase 0)

1. **#472 (CRÍTICO: HTTP 500 → RETRY STORM)**: `webhook-stripe-connect` L328-332 (invoice.paid) e L410-414 (invoice.marked_uncollectible) retornam HTTP 500 quando o UPDATE falha, causando retry storms infinitas do Stripe. Conforme memória `infrastructure/edge-functions-resilience-pattern`, webhooks DEVEM retornar 200 mesmo em erros de negócio.

2. **#473 (CRÍTICO: STATUS GUARD AUSENTE)**: `webhook-stripe-connect` L380-386 handler de `invoice.payment_failed` atualiza status para `falha_pagamento` sem cláusula de guarda `.eq('status', 'pendente')`. Conforme memória `payment/protecao-reversao-status-fatura`, faturas com status terminal `paga` podem ser revertidas por eventos automáticos de falha.

3. **#474 (CRÍTICO: STATUS GUARD AUSENTE)**: `webhook-stripe-connect` L514-521 handler de `payment_intent.payment_failed` atualiza para `falha_pagamento` sem guard. Se professor confirma pagamento manual e o PI original falha depois, o status `paga`/`paid` é sobrescrito.

4. **#481 (CRÍTICO: RPC INEXISTENTE)**: `process-cancellation` L377 chama `supabaseClient.rpc('teacher_has_financial_module', ...)`. Esta RPC NÃO existe no schema do banco de dados. Resultado: a chamada falha, `hasFinancialModule` é `null`/`false`, e ALL cancellation charges são silenciosamente ignoradas. Nenhuma fatura de cancelamento é gerada para nenhum professor.

5. **#470 (ALTO: .single() WEBHOOK)**: `webhook-stripe-connect` L190 usa `.single()` para buscar `pending_business_profiles`. Se Connect account não tem perfil pendente (ex: onboarding via dashboard), evento `account.updated` falha com exceção.

6. **#471 (ALTO: .single() WEBHOOK 3x)**: `webhook-stripe-connect` L310, L346, L457 usa `.single()` para verificar `payment_origin` de faturas. Se fatura não existe localmente (ex: criada diretamente no Stripe), lança exceção → HTTP 500 → retry storm.

7. **#475 (ALTO: INVOCAÇÃO SEM AUTH)**: `automated-billing` L522-529 e L850-858 invoca `create-payment-intent-connect` via `supabaseAdmin.functions.invoke` sem header `Authorization`. A função destino valida JWT via `auth.getUser(token)` — sem token, a chamada falha silenciosamente e NENHUM boleto é gerado para faturas automáticas.

8. **#479 (ALTO: FK SEMÂNTICO VIOLAÇÃO)**: `check-overdue-invoices` L50/L103 insere em `class_notifications` usando `class_id: invoice.id`. O campo `class_id` tem FK para `classes.id`, NÃO para `invoices.id`. A inserção causa violação de FK constraint ou corrompe dados referenciando classes inexistentes.

### Achados Altos/Médios

9. **#480 (ALTO: SPAM INFINITO)**: `check-overdue-invoices` verifica notificação prévia (L47-52/L100-105) mas NÃO insere registro de tracking após enviar a notificação (L62-67/L109-114). A cada execução do cron job, `existingNotification` é sempre null → re-envia TODAS as notificações → spam massivo.

10. **#476 (ALTO: stripeAccount AUSENTE)**: `cancel-payment-intent` L139 cancela Payment Intent sem parâmetro `stripeAccount`. Conforme memória `payment/stripe-connect-sdk-parameter-requirement`, PIs criados em contas Connect não são visíveis da conta platform → "resource not found".

11. **#482 (ALTO: IDOR CONFIRMADO)**: `verify-payment-status` L32-40 aceita `invoice_id` do body sem validar `auth.uid()` contra `teacher_id` ou `student_id` da fatura. Qualquer usuário autenticado pode consultar e atualizar status de qualquer fatura.

12. **#483 (ALTO: stripeAccount)**: `verify-payment-status` L73 retrieves PI sem `stripeAccount`. Faturas de Connect falham.

13. **#484 (ALTO: stripeAccount)**: `auto-verify-pending-invoices` L75-77 retrieves PI sem `stripeAccount`. Verificação automática de todas as faturas Connect falha silenciosamente.

14. **#486 (ALTO: FK JOIN)**: `automated-billing` L1033-1034 `validateTeacherCanBill` usa FK join `subscription_plans!inner (features)`. Schema cache do Deno → falha silenciosa → função retorna false → professores válidos não faturam.

15. **#487 (ALTO: STATUS GUARD AUSENTE)**: `webhook-stripe-connect` L425-431 `invoice.voided` atualiza para 'cancelada' sem guard `.eq('status', 'pendente')`. Fatura paga pode ser revertida.

16. **#485 (MÉDIO: STATUS GUARD)**: `auto-verify-pending-invoices` L91-98 atualiza status sem guard. Pode reverter `paga` se PI está em estado terminal.

17. **#478 (MÉDIO: .single())**: `process-cancellation` L107 usa `.single()` para buscar dependente. Dependente inexistente → crash total da função.

18. **#477 (MÉDIO: persistSession)**: `cancel-payment-intent` L37 cria client Supabase sem `{ auth: { persistSession: false } }`.

### Totais Atualizados (v5.60)
- 487 pontas soltas totais | 457 únicas | **445 pendentes**
- Fase 0: **108 itens** (+8: #472, #473, #474, #481, #470, #471, #475, #479)
- **100% cobertura**: 75 funções auditadas (23 passagens)

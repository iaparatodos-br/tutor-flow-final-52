

# Plano de Cobranca Hibrida -- v5.6

**Novas Pontas Soltas: #100-#107 | Novas Melhorias: M43-M47**
**Totais acumulados: 107 pontas soltas, 47 melhorias**

---

## Novas Pontas Soltas v5.6 (#100-#107)

### 100. change-payment-method usa FK join syntax `profiles!invoices_student_id_fkey` e `profiles!invoices_teacher_id_fkey` (Fase 5)

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 45-53)

```javascript
const { data: invoice, error: invoiceError } = await supabaseClient
  .from("invoices")
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(id, name, email),
    teacher:profiles!invoices_teacher_id_fkey(id, name)
  `)
  .eq("id", invoice_id)
  .single();
```

Mesma violacao FK join das pontas #86/#92/#94/#95. Porem, neste caso o `invoice.student` e `invoice.teacher` nao sao usados para nenhuma logica de negocio -- a funcao so precisa de `invoice.student_id` e `invoice.teacher_id` (que ja existem no `*`). Os dados do join sao completamente desperdiciados.

**Impacto**: Baixo (dados do join nao sao usados), mas contribui para o padrao inconsistente e risco de cache.

**Acao**: Remover os FK joins do select -- usar apenas `*` (ou melhor, selecionar apenas os campos necessarios).

### 101. change-payment-method logica de autorizacao de guardian esta incorreta (Fase 6)

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 73-91)

```javascript
// Check if user is a guardian of a dependent whose invoice this is
let isGuardian = false;
if (!isStudent) {
  const { data: dependentCheck } = await supabaseClient
    .from('dependents')
    .select('id, responsible_id')
    .eq('responsible_id', user.id)
    .limit(1);
  
  if (dependentCheck && dependentCheck.length > 0) {
    const { data: responsibleRelation } = await supabaseClient
      .from('dependents')
      .select('id')
      .eq('responsible_id', invoice.student_id)  // BUG: compara responsible_id com student_id da fatura
      .eq('responsible_id', user.id)              // BUG: dois .eq no mesmo campo -- segundo sobrescreve
      .limit(1);
    
    if (responsibleRelation && responsibleRelation.length > 0) {
      isGuardian = true;
    }
  }
}
```

Tres bugs interligados:
1. **Linha 84**: `.eq('responsible_id', invoice.student_id)` -- compara `responsible_id` do dependente com `student_id` da fatura. Mas `student_id` da fatura JA e o responsavel (billing resolution do `create-invoice` resolve dependente->responsavel). Portanto, esta query sempre falharia exceto quando `invoice.student_id === user.id` -- que ja e capturado por `isStudent`.
2. **Linha 85**: `.eq('responsible_id', user.id)` -- segundo `.eq` no mesmo campo sobrescreve o anterior, tornando a query: `WHERE responsible_id = user.id`. Isso sempre retorna resultados se o usuario tem dependentes, independente da fatura.
3. **Linhas 96-108**: O bloco `isResponsible` tambem e redundante -- `if (invoice.student_id === user.id)` ja foi verificado por `isStudent` na linha 68.

**Resultado**: A autorizacao funciona "por acidente" porque as faturas sao sempre emitidas para `responsible_id` (billing resolution). Mas se a logica de billing mudar, qualquer responsavel com dependentes poderia alterar o metodo de pagamento de faturas de OUTROS alunos.

**Acao**: Simplificar para: `isStudent || invoice.student_id === user.id`. Remover toda a logica de guardian/responsible que e redundante com o billing resolution.

### 102. process-cancellation usa R$5 como minimo para gerar fatura de cancelamento -- ignora PIX (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linha 434)

```javascript
if (chargeAmount >= 5) { // Mínimo para boleto: R$ 5,00
```

A mesma ponta #96 do `create-invoice` se repete aqui: o minimo e hardcoded em R$5 (boleto) sem considerar que PIX aceita R$1+. Uma taxa de cancelamento de 10% sobre uma aula de R$30 = R$3 deveria gerar fatura com PIX, mas e silenciosamente ignorada.

**Impacto**: Taxas de cancelamento entre R$1 e R$4,99 nunca sao cobradas, mesmo quando o professor aceita PIX.

**Acao**: Reduzir o minimo para R$1 (ou buscar `enabled_payment_methods` e usar o minimo do metodo mais acessivel).

### 103. verify-payment-status nao envia notificacao ao marcar fatura como paga (Fase 7)

**Arquivo**: `supabase/functions/verify-payment-status/index.ts` (linhas 82-104)

Quando o `verify-payment-status` detecta que um `PaymentIntent` mudou para `succeeded` e atualiza a fatura para `paga` (linhas 89-93), nenhuma notificacao e enviada ao aluno. Diferente do webhook (que processa o evento em tempo real), esta funcao e chamada sob demanda (ex: usuario clica "Verificar pagamento") e nao invoca `send-invoice-notification` com `notification_type: 'invoice_paid'`.

**Resultado**: Se o webhook falhar e o professor usar `verify-payment-status` para reconciliar, o aluno nunca recebe confirmacao de pagamento.

**Acao**: Adicionar invocacao fire-and-forget de `send-invoice-notification` com `notification_type: 'invoice_paid'` apos atualizar status para `paga`.

### 104. webhook-stripe-connect `payment_intent.succeeded` usa `.select()` apos `.update()` sem tratar retorno vazio (Fase 7)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 466-500)

```javascript
const { data: updatedInvoices, error } = await supabaseClient
  .from("invoices")
  .update({ status: "paid", ... })
  .eq("stripe_payment_intent_id", paymentIntent.id)
  .select();
```

Se nenhuma fatura corresponder ao `stripe_payment_intent_id` (evento orfao), `updatedInvoices` sera um array vazio e a funcao loga "No invoice found" (linha 496) mas **continua normalmente ate `completeEventProcessing`**. Ate aqui, correto.

Porem, o handler de `payment_intent.payment_failed` (linhas 514-536) usa o mesmo padrao mas NAO limpa os campos temporarios (pix_qr_code, boleto_url, etc.). Quando um pagamento falha, o aluno ve dados de pagamento expirados na interface.

**Impacto**: Apos falha de pagamento, o aluno ainda ve QR code PIX ou link de boleto expirados, gerando confusao.

**Acao**: No handler de `payment_intent.payment_failed`, limpar campos temporarios (pix_qr_code, pix_copy_paste, pix_expires_at, boleto_url, linha_digitavel, boleto_expires_at, barcode).

### 105. webhook-stripe-connect `invoice.payment_succeeded` sobrescreve `payment_method` com 'stripe_invoice' (Fase 7)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 354-362)

```javascript
const { error: succeededError } = await supabaseClient
  .from('invoices')
  .update({ 
    status: 'paid',
    payment_origin: 'automatic',
    payment_method: 'stripe_invoice',  // <-- SOBRESCREVE o método específico
    updated_at: new Date().toISOString()
  })
  .eq('stripe_invoice_id', succeededInvoice.id);
```

Confirmacao direta da ponta #78 documentada no plano: o handler de `invoice.payment_succeeded` sobrescreve `payment_method` com `'stripe_invoice'`, perdendo o rotulo especifico (boleto, pix, card). Isso viola a constraint documentada em `webhook-payment-method-persistence-logic`.

O handler de `payment_intent.succeeded` (linha 471) faz CORRETAMENTE: `payment_method: paymentIntent.payment_method_types[0]`.

**Impacto**: Faturas pagas via `invoice.payment_succeeded` aparecem como "stripe_invoice" no Financeiro em vez de "Boleto" ou "PIX".

**Acao**: Remover `payment_method: 'stripe_invoice'` do update. Se necessario preservar o metodo, buscar o payment_method da fatura existente antes do update e manter.

### 106. create-payment-intent-connect retorna HTTP 400 para validacoes de metodo habilitado -- viola constraint (Fase 5)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 74-81)

```javascript
return new Response(JSON.stringify({
  error: `O método de pagamento "${payment_method}" não está habilitado...`,
  success: false
}), {
  headers: { ...corsHeaders, "Content-Type": "application/json" },
  status: 400,  // <-- VIOLA constraint error-handling-user-friendly-messages
});
```

A constraint `error-handling-user-friendly-messages` diz: "Edge functions should return HTTP 200 status with success:false in JSON body for validation/business logic errors". Esta funcao retorna HTTP 400 para validacoes de negocio (linhas 79, 93, 104, 118), causando perda de mensagem no frontend quando `functions.invoke()` captura o erro.

As mesmas validacoes de minimo/maximo para boleto e PIX (linhas 86-120) tambem retornam HTTP 400.

**Impacto**: O frontend nao mostra a mensagem de erro detalhada ao usuario -- apenas um "Internal error" generico.

**Acao**: Alterar todos os retornos de validacao de HTTP 400 para HTTP 200 com `success: false`.

### 107. generate-boleto-for-invoice retorna HTTP 500 no catch -- viola constraint (Fase 5)

**Arquivo**: `supabase/functions/generate-boleto-for-invoice/index.ts` (linhas 146-156)

```javascript
} catch (error) {
  ...
  return new Response(JSON.stringify({ error: errorMessage, success: false }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 500,
  });
}
```

Mesma violacao da constraint `error-handling-user-friendly-messages`. Erros de validacao como "Dados incompletos do aluno" (linha 93) ou "valor minimo para boleto" (linha 57) sao lancados via `throw` e capturados pelo catch geral, retornando HTTP 500. O frontend perde a mensagem detalhada.

**Acao**: Para erros de validacao conhecidos, retornar HTTP 200 com `success: false` dentro do bloco de validacao (antes do `throw`). O catch geral pode manter HTTP 500 para erros inesperados.

---

## Novas Melhorias v5.6 (M43-M47)

### M43. check-overdue-invoices atualiza status para 'overdue' sem verificar se fatura ja esta paga (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 55-59)

```javascript
// Atualizar status da fatura
await supabase
  .from("invoices")
  .update({ status: "overdue" })
  .eq("id", invoice.id);
```

O update nao inclui `.eq('status', 'pendente')` como condicao. Se uma fatura foi paga pelo webhook APOS ser carregada pelo SELECT (race condition com ~1 segundo de janela), o update reverte o status de 'paga' para 'overdue'.

**Impacto**: Raro (race condition), mas pode causar fatura paga ser revertida para vencida.

**Acao**: Adicionar `.eq('status', 'pendente')` ao update para garantir que so faturas ainda pendentes sejam marcadas como vencidas.

### M44. create-payment-intent-connect error response usa HTTP 500 para TODOS os erros (Fase 5)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 647-658)

O catch geral retorna HTTP 500 para todos os erros, incluindo erros do Stripe que podem conter mensagens uteis (ex: "PIX nao habilitado"). A traducao especifica para PIX (linhas 650-651) e uma excecao, mas outros erros do Stripe (ex: "account restricted", "invalid parameter") sao retornados como HTTP 500 generico.

**Acao**: Identificar erros de validacao do Stripe (ex: `stripeError.type === 'StripeInvalidRequestError'`) e retorna-los como HTTP 200 com `success: false` e mensagem traduzida.

### M45. cancel-payment-intent marca fatura como 'paid' sem verificar status anterior (Fase 7)

**Arquivo**: `supabase/functions/cancel-payment-intent/index.ts` (linhas 169-179)

```javascript
const { error: updateError } = await supabase
  .from('invoices')
  .update({
    status: 'paid',
    payment_origin: 'manual',
    ...
  })
  .eq('id', invoice_id);
```

O update nao verifica se a fatura ja esta paga (via webhook que processou entre a busca e o update). Se o webhook marcou como 'paid' com `payment_origin: 'automatic'`, o `cancel-payment-intent` sobrescreve para `payment_origin: 'manual'`, perdendo a informacao de que o pagamento foi automatico.

**Acao**: Adicionar `.in('status', ['pendente', 'open', 'falha_pagamento'])` ao update para evitar sobrescrever faturas ja pagas.

### M46. webhook-stripe-connect `invoice.paid` e `invoice.payment_succeeded` atualizam por `stripe_invoice_id` mas faturas locais usam `stripe_payment_intent_id` (Fase 7)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 317-324 e 354-362)

Os handlers de `invoice.paid` e `invoice.payment_succeeded` fazem:
```javascript
.eq('stripe_invoice_id', paidInvoice.id)
```

Porem, as faturas locais sao criadas por `create-invoice` e `automated-billing`, que populam `stripe_payment_intent_id` (via `create-payment-intent-connect`) mas NUNCA populam `stripe_invoice_id`. O campo `stripe_invoice_id` so e populado por fluxos de Stripe Billing (subscricoes da plataforma), nao por Connect.

**Resultado**: Os updates `.eq('stripe_invoice_id', ...)` nunca encontram faturas de Connect, fazendo com que `invoice.paid` e `invoice.payment_succeeded` sejam efetivamente no-ops para faturas de aulas. O pagamento so e processado pelo `payment_intent.succeeded`.

**Impacto**: Baixo (as faturas sao processadas pelo handler correto `payment_intent.succeeded`), mas os handlers `invoice.paid/payment_succeeded` geram logs enganosos e a query `.single()` pode lancar excecao (#87).

**Acao**: Documentar que esses handlers sao para Stripe Billing (subscricoes) e nao para Connect (faturas de aulas). Alterar `.single()` para `.maybeSingle()` conforme #87.

### M47. send-invoice-notification nao verifica se invoice esta com status valido antes de enviar (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 39-62)

A funcao busca a fatura e envia a notificacao sem verificar se o `invoice.status` e compativel com o `notification_type`. Por exemplo:
- `notification_type: 'invoice_overdue'` pode ser enviado para uma fatura com `status: 'paga'` (se o webhook pagou a fatura entre o SELECT do `check-overdue-invoices` e a invocacao do `send-invoice-notification`)
- `notification_type: 'invoice_created'` pode ser enviado para uma fatura ja cancelada

**Impacto**: Raro (race condition), mas pode enviar "Sua fatura esta vencida" para uma fatura ja paga.

**Acao**: Adicionar validacao: se `notification_type === 'invoice_overdue'` e `invoice.status === 'paga'`, logar e retornar `success: true, skipped: true`.

---

## Indice Atualizado (apenas novos itens)

| # | Descricao | Fase | Arquivo(s) |
|---|-----------|------|------------|
| 100 | change-payment-method FK join desnecessario | 5 | change-payment-method/index.ts |
| 101 | change-payment-method autorizacao de guardian incorreta | 6 | change-payment-method/index.ts |
| 102 | process-cancellation minimo R$5 hardcoded ignora PIX | 6 | process-cancellation/index.ts |
| 103 | verify-payment-status nao envia notificacao ao reconciliar pagamento | 7 | verify-payment-status/index.ts |
| 104 | webhook payment_intent.payment_failed nao limpa campos temporarios | 7 | webhook-stripe-connect/index.ts |
| 105 | webhook invoice.payment_succeeded sobrescreve payment_method com 'stripe_invoice' | 7 | webhook-stripe-connect/index.ts |
| 106 | create-payment-intent-connect HTTP 400 para validacoes viola constraint | 5 | create-payment-intent-connect/index.ts |
| 107 | generate-boleto-for-invoice HTTP 500 no catch viola constraint | 5 | generate-boleto-for-invoice/index.ts |

| # | Descricao | Fase |
|---|-----------|------|
| M43 | check-overdue-invoices race condition ao atualizar status overdue | 8 |
| M44 | create-payment-intent-connect catch geral HTTP 500 para erros do Stripe | 5 |
| M45 | cancel-payment-intent sobrescreve payment_origin de fatura ja paga | 7 |
| M46 | webhook invoice.paid/payment_succeeded nunca encontra faturas de Connect | 7 |
| M47 | send-invoice-notification envia notificacao sem validar status compativel | 8 |

---

## Historico de Versoes (atualizado)

| Versao | Data | Mudancas |
|--------|------|----------|
| v5.6 | 2026-02-13 | +8 pontas soltas (#100-#107), +5 melhorias (M43-M47): change-payment-method FK join + autorizacao guardian bugada, process-cancellation minimo R$5 ignora PIX, verify-payment-status sem notificacao, webhook payment_failed nao limpa campos, webhook payment_succeeded sobrescreve payment_method, create-payment-intent-connect e generate-boleto HTTP status incorretos, race conditions em overdue/cancel-payment, webhook invoice handlers nunca matcham faturas Connect, send-invoice-notification sem validacao de status |
| v5.5 | 2026-02-13 | +8 pontas soltas (#92-#99), +5 melhorias (M38-M42) |
| v5.4 | 2026-02-13 | +6 pontas soltas (#86-#91), +3 melhorias (M35-M37) |

---

## Secao Tecnica: Resumo de Severidade v5.6

**CRITICOS (bloqueiam funcionalidade):**
- #101: Autorizacao de guardian no change-payment-method esta fundamentalmente incorreta -- qualquer responsavel com dependentes pode alterar metodo de pagamento de faturas de OUTROS alunos
- #106: Validacoes de negocio retornam HTTP 400, frontend perde mensagem detalhada

**ALTOS (dados incorretos ou UX degradada):**
- #102: Taxas de cancelamento R$1-R$4,99 silenciosamente ignoradas
- #103: Reconciliacao manual de pagamento nao notifica aluno
- #104: Dados de pagamento expirados permanecem visiveis apos falha
- #105: `payment_method` sobrescrito com 'stripe_invoice' (confirmacao #78)
- #107: Erros de validacao de boleto retornam HTTP 500 generico

**MEDIOS (otimizacao e resiliencia):**
- #100: FK join desnecessario no change-payment-method
- M43: Race condition overdue vs paga
- M44: Catch geral HTTP 500 para erros do Stripe tratáveis
- M45: cancel-payment-intent sobrescreve payment_origin
- M46: webhook invoice handlers sao no-ops para faturas Connect
- M47: Notificacao enviada sem validar status compativel

---

## Panorama Consolidado: FK Join Violations (atualizado)

A constraint `edge-functions-pattern-sequential-queries` e violada em **9 locais** distribuidos por 6 edge functions:

| Funcao | Linhas | Joins | Ponta |
|--------|--------|-------|-------|
| automated-billing | 72-89 | profiles!teacher_id, profiles!student_id | #86 |
| automated-billing | 212-226 | classes!inner | #98 |
| automated-billing | 1030-1038 | subscription_plans!inner | M37 |
| create-invoice | 143-154 | business_profiles!fkey | #92 |
| create-invoice | 226-241 | classes!inner -> class_services | #93 |
| create-payment-intent-connect | 37-51 | profiles!fkey x2, business_profiles!fkey | #94 |
| generate-boleto-for-invoice | 34-45 | profiles!fkey x2 | #95 |
| change-payment-method | 45-53 | profiles!fkey x2 (desnecessario) | #100 |
| webhook-stripe-connect | 306-310, 343-347 | .single() em invoices (nao FK, mas fragil) | #87 |

---

## Panorama Consolidado: HTTP Status Violations

A constraint `error-handling-user-friendly-messages` e violada em **6 locais**:

| Funcao | Linhas | Status Incorreto | Ponta |
|--------|--------|------------------|-------|
| create-payment-intent-connect | 74-81, 88-94, 98-105, 110-118 | 400 | #106 |
| create-payment-intent-connect | 647-658 | 500 (catch geral) | M44 |
| generate-boleto-for-invoice | 146-156 | 500 (catch geral) | #107 |
| process-cancellation | 493-499 | 500 (catch geral) | M40 |
| change-payment-method | 245-251 | 500 (catch geral) | novo |
| check-overdue-invoices | 139-150 | 500 (catch geral) | novo |
| send-invoice-notification | 455-463 | 500 (catch geral) | M36 |

**Recomendacao**: Resolver todas as violacoes de HTTP status como um batch unico (Sprint de Resiliencia).

---

## Panorama Consolidado: Minimo R$5 Hardcoded (ignora PIX)

A validacao de minimo R$5 (boleto) e aplicada incondicionalmente em 2 locais, bloqueando PIX valido (>= R$1):

| Funcao | Linhas | Ponta |
|--------|--------|-------|
| create-invoice | 58-69 | #96 |
| process-cancellation | 434 | #102 |

O `create-payment-intent-connect` ja implementa corretamente a validacao separada por metodo (R$5 boleto, R$1 PIX) nas linhas 85-120.



# Plano de Cobranca Hibrida -- v5.4

**Novas Pontas Soltas: #86-#91 | Novas Melhorias: M35-M37**
**Totais acumulados: 91 pontas soltas, 37 melhorias**

---

## Novas Pontas Soltas v5.4 (#86-#91)

### 86. automated-billing usa FK join syntax na query principal -- viola constraint de infraestrutura (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 72-89)

A query principal que busca `relationshipsToBill` usa FK join syntax extensivamente:
```javascript
.select(`
  id, student_id, teacher_id, billing_day, business_profile_id,
  teacher:profiles!teacher_id ( id, name, email, payment_due_days ),
  student:profiles!student_id ( id, name, email )
`)
```

Isso viola diretamente a constraint documentada em `constraints/edge-functions-pattern-sequential-queries`: "avoid foreign key join syntax (e.g., 'table!fk(...)') and instead use sequential independent supabaseClient calls". O schema cache do Deno pode falhar silenciosamente, retornando `null` para `teacher` ou `student` e causando billing para o aluno errado ou skipping silencioso.

**Impacto**: Toda execucao do `automated-billing` depende dessa query. Uma falha de cache causaria zero faturas processadas sem erro explicito (apenas logs "Skipping" por falta de dados do professor).

**Acao**: Refatorar para buscar relationships primeiro (sem joins), depois fazer queries sequenciais para `profiles` usando os IDs retornados.

### 87. webhook-stripe-connect `invoice.paid` e `invoice.payment_succeeded` usam `.single()` para lookup de `payment_origin` (Fase 7)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 308-311 e 343-347)

```javascript
// invoice.paid (linha 310)
const { data: existingInvoice } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_invoice_id', paidInvoice.id)
  .single();

// invoice.payment_succeeded (linha 346)
const { data: existingSucceeded } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_invoice_id', succeededInvoice.id)
  .single();
```

Quando o Stripe envia um evento para uma fatura que nao existe no banco (evento orfao de outra integracao, fatura deletada, ou fatura criada por outro sistema), o `.single()` lanca excecao. Como o catch geral (linha 551-558) retorna HTTP 500, o Stripe reprocessa o evento indefinidamente.

Isso e distinto da ponta #74 (que trata `payment_intent.succeeded`) -- aqui o problema esta nos handlers de `invoice.paid` e `invoice.payment_succeeded`.

**Acao**: Substituir por `.maybeSingle()`. Se `existingInvoice` for `null`, logar "No local invoice found for stripe_invoice_id" e fazer `break` (evento orfao).

### 88. process-cancellation nao verifica `is_paid_class` nem `charge_timing` -- aulas prepaid pagas recebem cobranca de cancelamento (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 216-225)

A logica de `shouldCharge` so verifica `is_experimental`:
```javascript
if (classData.is_experimental === true) {
  shouldCharge = false;
} else if (cancelled_by_type === 'student' && hoursUntilClass < hoursBeforeClass && chargePercentage > 0) {
  shouldCharge = true;
}
```

Faltam duas verificacoes criticas documentadas no plano:
1. **`is_paid_class = false`**: Aulas gratuitas/reposicao NUNCA devem gerar cobranca de cancelamento
2. **`charge_timing = 'prepaid'`**: A regra de negocio diz "sem reembolso/credito/anistia" para prepaid -- mas tambem nao deve gerar nova fatura de cancelamento (invariante de seguranca da linha 67 do plano)

A query da aula (linha 46) tambem nao busca `is_paid_class`:
```javascript
.select('id, teacher_id, class_date, status, is_group_class, service_id, is_experimental')
```

**Impacto**: 
- Aulas gratuitas canceladas tardiamente geram cobranca indevida
- Aulas prepaid canceladas geram fatura de cancelamento duplicada (aluno ja pagou antes)

**Acao**: 
1. Adicionar `is_paid_class` ao SELECT da aula
2. Buscar `charge_timing` do `business_profiles` do professor
3. Adicionar condicoes: `if (!classData.is_paid_class) shouldCharge = false` e `if (chargeTiming === 'prepaid') shouldCharge = false`

### 89. automated-billing fluxo tradicional hardcoda `payment_method: 'boleto'` ignorando hierarquia de metodos habilitados (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linha 527)

```javascript
body: {
  invoice_id: invoiceId,
  payment_method: 'boleto' // Default to boleto for automated billing
}
```

O mesmo problema existe no fluxo de mensalidade (linha 855) e no fluxo outside-cycle (linha 969). Todos passam `payment_method: 'boleto'` sem consultar `business_profiles.enabled_payment_methods`.

Se o professor desabilitou boleto e habilitou apenas PIX, o `create-payment-intent-connect` tentara criar um boleto no Stripe Connect, que pode falhar ou criar um metodo de pagamento que o professor nao aceita.

**Impacto**: Faturas automatizadas podem ficar sem metodo de pagamento funcional se o professor so aceita PIX. Diferente da ponta #75 (que trata valor abaixo do minimo), aqui o problema e que **nenhum** dos 3 fluxos consulta os metodos habilitados.

**Acao**: Antes de gerar pagamento, buscar `enabled_payment_methods` do `business_profiles` e aplicar a hierarquia: Boleto (se habilitado e >= R$5) -> PIX (se habilitado e >= R$1) -> Nenhum.

### 90. check-overdue-invoices idempotencia quebrada -- nunca faz INSERT do tracking record (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 43-74)

Confirmacao por inspecao direta: o fluxo de faturas vencidas (linhas 43-75) faz SELECT de `class_notifications` para verificar se ja notificou (linha 47-52), mas NUNCA faz INSERT apos enviar a notificacao. O bloco apos `if (!existingNotification)` (linhas 54-70) envia a notificacao e incrementa o contador, mas nao insere nenhum registro de tracking.

Isso ja foi documentado nas pontas #47 e #71, mas a confirmacao por codigo mostra que **ambos** os fluxos (overdue e reminder, linhas 96-122) sofrem o mesmo problema -- o fluxo de reminder (linhas 99-105) tambem faz SELECT sem INSERT posterior.

**Resultado concreto**: Cada execucao do cron re-envia TODAS as notificacoes de vencimento e lembretes para TODAS as faturas elegíveis, indefinidamente. Um aluno com 3 faturas vencidas recebe 3 emails por execucao do cron.

**Acao**: Implementar `overdue_notification_sent` em `invoices` (conforme M15/#82) e adicionar INSERT/UPDATE apos envio bem-sucedido. Tambem adicionar campo `reminder_notification_sent` para o fluxo de lembrete.

### 91. webhook-stripe-connect retorna HTTP 500 para falhas de update em `invoice.paid` e `invoice.marked_uncollectible` (Fase 7)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 326-332 e 409-415)

```javascript
// invoice.paid (linhas 328-332)
if (paidError) {
  return new Response(JSON.stringify({ error: 'Failed to update invoice to paid' }), { 
    status: 500,
  });
}

// invoice.marked_uncollectible (linhas 410-415)
if (overdueError) {
  return new Response(JSON.stringify({ error: 'Failed to update invoice to overdue' }), { 
    status: 500,
  });
}
```

Em ambos os casos, um erro de UPDATE no banco (ex: invoice nao encontrada, RLS bloqueou, conexao temporaria) causa HTTP 500. O Stripe reprocessa eventos com 500 ate 3x com backoff, gerando logs de erro repetidos e mascarando o problema real.

Diferente da ponta #77 (que trata erros nao-criticos genericos), aqui o `return` dentro do `case` impede que o evento seja marcado como processado pelo `completeEventProcessing` (linha 544), criando inconsistencia na tabela de idempotencia.

**Acao**: Substituir `return` com HTTP 500 por log do erro + `break` (continuar para `completeEventProcessing`). Se o update falhou porque a invoice nao existe localmente, isso nao e critico -- o evento pode ser ignorado com seguranca.

---

## Novas Melhorias v5.4 (M35-M37)

### M35. automated-billing consulta `cancellation_policies` dentro do loop de cancelamentos -- duplicacao de queries (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 351-356 e 413-418)

A `cancellation_policies` do professor e consultada **duas vezes** para cada aula cancelada: uma vez no loop de calculo de valor (linha 351) e outra no loop de criacao de itens (linha 413). Para um aluno com 5 cancelamentos, isso gera 10 queries identicas.

**Acao**: Mover a query para fora dos loops (antes da linha 335), armazenar em variavel, e reutilizar nos dois loops. Isso reduz queries de `2 * N_cancelamentos` para `1`.

### M36. send-invoice-notification student e teacher lookups usam `.single()` sem fallback (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 66-69 e 96-99)

```javascript
// Student lookup (linha 69)
.eq("id", invoice.student_id)
.single();

// Teacher lookup (linha 99)
.eq("id", invoice.teacher_id)
.single();
```

Se o perfil do aluno ou professor foi deletado (cenario raro mas possivel em contas desativadas), o `.single()` lanca excecao com "Row not found". O `throw new Error("Student not found")` subsequente retorna HTTP 500 para o caller.

Quando chamado pelo `automated-billing` (fire-and-forget), o erro e silencioso. Quando chamado pelo `check-overdue-invoices`, pode interromper o loop de processamento.

**Acao**: Substituir por `.maybeSingle()` com fallback para dados da fatura (`invoice.description` contem informacoes suficientes para um email generico).

### M37. validateTeacherCanBill usa FK join syntax `subscription_plans!inner` (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 1030-1038)

```javascript
const { data: subscription } = await supabaseAdmin
  .from('user_subscriptions')
  .select(`status, subscription_plans!inner ( features )`)
  .eq('user_id', teacher.id)
  .eq('status', 'active')
  .maybeSingle();
```

Mesma violacao da ponta #86 (FK join syntax). Se o schema cache falhar, `subscription_plans` retorna null e o professor e considerado sem modulo financeiro, pulando completamente o faturamento.

**Acao**: Separar em duas queries sequenciais: buscar `user_subscriptions`, depois buscar `subscription_plans` pelo `plan_id`.

---

## Indice Atualizado (apenas novos itens)

| # | Descricao | Fase | Arquivo(s) |
|---|-----------|------|------------|
| 86 | automated-billing usa FK join syntax na query principal | 5 | automated-billing/index.ts |
| 87 | webhook invoice.paid/payment_succeeded usa .single() para payment_origin | 7 | webhook-stripe-connect/index.ts |
| 88 | process-cancellation nao verifica is_paid_class nem charge_timing | 6 | process-cancellation/index.ts |
| 89 | automated-billing hardcoda boleto ignorando enabled_payment_methods | 5 | automated-billing/index.ts |
| 90 | check-overdue-invoices nunca faz INSERT do tracking record (confirmacao #71) | 8 | check-overdue-invoices/index.ts |
| 91 | webhook retorna HTTP 500 para falhas de update em invoice.paid e marked_uncollectible | 7 | webhook-stripe-connect/index.ts |

| # | Descricao | Fase |
|---|-----------|------|
| M35 | automated-billing cancellation_policies consultada 2x por cancelamento no loop | 5 |
| M36 | send-invoice-notification student/teacher lookups com .single() sem fallback | 8 |
| M37 | validateTeacherCanBill usa FK join syntax subscription_plans!inner | 5 |

---

## Historico de Versoes (atualizado)

| Versao | Data | Mudancas |
|--------|------|----------|
| v5.4 | 2026-02-13 | +6 pontas soltas (#86-#91), +3 melhorias (M35-M37): automated-billing FK join syntax em query principal e validateTeacherCanBill, webhook .single() em invoice.paid/payment_succeeded, process-cancellation sem verificar is_paid_class/charge_timing, automated-billing hardcoda boleto, check-overdue-invoices confirmacao de idempotencia quebrada em ambos fluxos, webhook HTTP 500 em invoice.paid e marked_uncollectible |

---

## Secao Tecnica: Resumo de Severidade

**CRITICOS (bloqueiam funcionalidade):**
- #86: Query principal do automated-billing usa FK join proibido -- pode falhar silenciosamente
- #88: Aulas gratuitas e prepaid recebem cobranca de cancelamento indevida
- #90: Notificacoes de vencimento enviadas infinitamente a cada execucao do cron

**ALTOS (dados incorretos ou UX degradada):**
- #87: Webhook crash em eventos orfaos de invoice.paid/payment_succeeded
- #89: Faturas automatizadas ignoram metodos de pagamento habilitados pelo professor
- #91: HTTP 500 no webhook causa retries infinitos do Stripe e quebra idempotencia

**MEDIOS (otimizacao e resiliencia):**
- M35: Queries duplicadas de cancellation_policies no loop
- M36: send-invoice-notification crash se perfil deletado
- M37: validateTeacherCanBill com FK join fragil


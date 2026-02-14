

# Auditoria Profunda v5.20 — 6 Novas Pontas Soltas Identificadas

## Resumo

Revisao exaustiva do codigo atual de todas as Edge Functions financeiras contra as 156 pontas soltas existentes revelou **6 novas pontas soltas (#157-#162)** em 5 funcoes. Totais atualizados: **162 pontas soltas** (8 implementadas, 154 pendentes) e **52 melhorias**.

---

## Novas Pontas Soltas (v5.20)

### #157 -- verify-payment-status usa `.single()` sem tratamento semantico (Batch 5 -- MEDIA)

**Arquivo**: `supabase/functions/verify-payment-status/index.ts` (linha 40)

```text
.eq("id", invoice_id)
.single();
```

Mesmo padrao dos #153/#154. Se `invoice_id` nao existir, retorna HTTP 500 com `"Invoice not found"` generico. Funcao chamada pelo frontend para polling de status de pagamento — IDs invalidos geram erros tecnicos no console do usuario.

**Acao**: Trocar `.single()` por `.maybeSingle()`. Se `!invoice`, retornar HTTP 404 com `{ error: "Fatura nao encontrada" }`.

---

### #158 -- verify-payment-status nao tem guard clause de status no UPDATE — race condition (Batch 1 -- ALTA)

**Arquivo**: `supabase/functions/verify-payment-status/index.ts` (linhas 90-93)

```text
const { error: updateError } = await supabaseClient
  .from("invoices")
  .update({ status: newStatus })
  .eq("id", invoice_id);
```

Mesma race condition critica dos #155/#156. Esta funcao e chamada pelo frontend (polling manual) apos o aluno realizar pagamento. Se o webhook Stripe ja processou o pagamento e atualizou para `paga`, mas o PI no Stripe esta em estado `canceled` (de um PI anterior associado a fatura), o verify-payment-status pode sobrescrever `paga` → `falha_pagamento`.

**Cenario concreto**: Aluno paga via PIX (PI_1 succeeds, webhook marca como `paga`). Frontend ainda tem referencia ao PI_0 (boleto cancelado). Frontend chama verify-payment-status com PI_0. Stripe retorna `canceled`. verify-payment-status sobrescreve `paga` → `falha_pagamento`. **PERDA FINANCEIRA**.

**Acao**: Adicionar guard clause:
```text
.eq("id", invoice_id)
.in("status", ["pendente", "falha_pagamento"]) // Nunca sobrescrever 'paga' ou 'cancelada'
```

---

### #159 -- send-invoice-notification usa `.single()` em 3 lookups criticos (Batch 8 -- MEDIA)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 57, 69, 99)

```text
// Linha 57: invoice lookup
.eq("id", payload.invoice_id)
.single();

// Linha 69: student profile lookup
.eq("id", invoice.student_id)
.single();

// Linha 99: teacher profile lookup
.eq("id", invoice.teacher_id)
.single();
```

Funcao de notificacao chamada fire-and-forget por multiplas funcoes (check-overdue-invoices, automated-billing, cancel-payment-intent). Se qualquer `.single()` falhar (ex: perfil deletado, fatura removida entre criacao e envio de notificacao), a funcao lanca excecao que e engolida pelo caller, e a notificacao e silenciosamente perdida. Nao ha retry ou log no caller.

**Impacto**: Notificacoes de faturas vencidas, pagas ou criadas podem ser perdidas sem nenhuma visibilidade para o professor ou aluno.

**Acao**: Trocar todos por `.maybeSingle()`. Se `!invoice`, retornar `{ success: false, error: "Fatura nao encontrada" }` com HTTP 200 (para nao causar retry no caller). Se `!student` ou `!teacher`, logar warning e retornar `{ success: false, skipped: true, reason: "Perfil nao encontrado" }`.

---

### #160 -- webhook-stripe-connect invoice.payment_failed nao verifica payment_origin antes de atualizar (Batch 1 -- ALTA)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 372-393)

```text
case 'invoice.payment_failed': {
  const failedInvoice = eventObject as Stripe.Invoice;
  
  const { error: failedError } = await supabaseClient
    .from('invoices')
    .update({ 
      status: 'falha_pagamento',
      updated_at: new Date().toISOString()
    })
    .eq('stripe_invoice_id', failedInvoice.id);
  ...
}
```

Os handlers `invoice.paid` (linha 306) e `payment_intent.succeeded` (linha 452) verificam `payment_origin === 'manual'` antes de atualizar, mas o handler `invoice.payment_failed` NAO faz essa verificacao. Se o professor marcou a fatura como paga manualmente (via cancel-payment-intent), e o Stripe envia um evento `invoice.payment_failed` referente ao invoice antigo, o status e sobrescrito de `paid` para `falha_pagamento`.

**Cenario concreto**: Professor marca fatura como paga manualmente. Stripe tenta cobrar o invoice automatizado antigo, falha, e envia `invoice.payment_failed`. Webhook sobrescreve `paid` → `falha_pagamento`. Aluno recebe notificacao de falha indevida.

Mesmo padrao aplicavel a `invoice.marked_uncollectible` (linha 396) e `payment_intent.payment_failed` (linha 504).

**Acao**: Adicionar verificacao de `payment_origin` antes de atualizar em TODOS os handlers de falha:
```text
// Verificar se ja foi paga manualmente
const { data: existingInvoice } = await supabaseClient
  .from('invoices')
  .select('payment_origin, status')
  .eq('stripe_invoice_id', failedInvoice.id)
  .maybeSingle();

if (existingInvoice?.payment_origin === 'manual' || existingInvoice?.status === 'paid' || existingInvoice?.status === 'paga') {
  logStep("Invoice already paid/manual, skipping failure update");
  break;
}
```

Aplicar tambem em:
- `invoice.marked_uncollectible` (linhas 396-417)
- `payment_intent.payment_failed` (linhas 504-536)

---

### #161 -- process-cancellation usa `.single()` para lookup de dependente (Batch 5 -- MEDIA)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linha 107)

```text
const { data: dependent } = await supabaseClient
  .from('dependents')
  .select('name, responsible_id')
  .eq('id', dependent_id)
  .single();
```

Se o dependente foi removido entre a abertura do modal de cancelamento e a submissao, `.single()` lanca excecao que interrompe TODO o cancelamento. O usuario recebe HTTP 500 e a aula permanece em estado inconsistente (nao cancelada nem ativa).

**Acao**: Trocar por `.maybeSingle()`. Se `!dependent`, retornar erro amigavel: `{ success: false, error: "Dependente nao encontrado" }` com HTTP 404.

---

### #162 -- create-invoice usa `.single()` em lookup de relacionamento e guardian data (Batch 5 -- MEDIA)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 154, 382)

```text
// Linha 154: relationship lookup
.eq('teacher_id', user.id)
.single();

// Linha 382: guardian data lookup
.eq('teacher_id', user.id)
.single();
```

O `.single()` na linha 154 ja tem tratamento parcial (linhas 156-159 checam `relationshipError`), mas o erro retornado e HTTP 500 generico em vez de uma mensagem amigavel. O `.single()` na linha 382 busca dados do guardiao para logging — se falhar, a criacao da fatura inteira falha, mesmo que os dados do guardiao sejam opcionais.

**Acao**: 
- Linha 154: Trocar por `.maybeSingle()`. Manter logica existente mas retornar HTTP 404 amigavel.
- Linha 382: Trocar por `.maybeSingle()`. Tratar `!relationshipData` graciosamente (continuar sem dados de guardiao).

---

## Atualizacoes no Plano

### Cabecalho e Totais

- Titulo: `v5.19` para `v5.20`
- Totais: `156 pontas soltas` para `162 pontas soltas` (8 implementadas, 154 pendentes)

### Tabela de Cobertura (expandir/adicionar entradas)

| Funcao | Pontas Documentadas (atualizado) |
|--------|--------------------------------|
| verify-payment-status | **#157, #158** (NOVA) |
| send-invoice-notification | **#159** (NOVA) |
| webhook-stripe-connect | #86, **#160** |
| process-cancellation | #5.1, #5.2, #107, **#161** |
| create-invoice | #61, #62, **#162** |
| process-orphan-cancellation-charges | #105, #106, #123, #149, #150, #152 |
| create-payment-intent-connect | #119, #153 |
| change-payment-method | #114, #115, #154 |
| check-overdue-invoices | #41, #47, #56, #71, #81, #95, #126, #155 |
| auto-verify-pending-invoices | M52, #156 |
| generate-boleto-for-invoice | #103, #121, #148, #151 |
| cancel-payment-intent | (cobertura OK — `.single()` na linha 71 mas erro tratado com HTTP 404 na linha 73-78) |

### Padroes Transversais (atualizar contagens)

- **`.single()` vs `.maybeSingle()`**: adicionar #157, #159, #161, #162 (total: **20 funcoes afetadas**)
- **Guard clause de status ausente no UPDATE**: adicionar #158 (total: 4 funcoes: check-overdue, auto-verify, verify-payment-status, webhook-stripe-connect)
- **Verificacao de payment_origin ausente em handlers de falha**: #160 (NOVO padrao — 3 handlers afetados no webhook)

### Roadmap de Batches

| # | Batch | Severidade | Justificativa |
|---|-------|-----------|---------------|
| #157 | 5 (FK/Query) | MEDIA | `.single()` em funcao de polling — HTTP 500 no frontend |
| #158 | 1 (Critico) | ALTA | Race condition pode reverter fatura paga — PERDA FINANCEIRA |
| #159 | 8 (Polish) | MEDIA | `.single()` em notificacao fire-and-forget — notificacoes perdidas silenciosamente |
| #160 | 1 (Critico) | ALTA | Webhook de falha reverte fatura paga manualmente — PERDA FINANCEIRA |
| #161 | 5 (FK/Query) | MEDIA | `.single()` em cancelamento — cancelamento inteiro falha se dependente removido |
| #162 | 5 (FK/Query) | MEDIA | `.single()` em criacao de fatura — fatura falha por dados opcionais |

---

## Secao Tecnica

### Correcao do #157

Substituir na linha 40:
```text
.eq("id", invoice_id)
.maybeSingle();

if (invoiceError) {
  logStep("Error fetching invoice", invoiceError);
  throw new Error("Erro ao buscar fatura");
}

if (!invoice) {
  return new Response(JSON.stringify({ 
    error: "Fatura nao encontrada" 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 404,
  });
}
```

### Correcao do #158

Substituir nas linhas 90-93:
```text
const { error: updateError } = await supabaseClient
  .from("invoices")
  .update({ status: newStatus })
  .eq("id", invoice_id)
  .in("status", ["pendente", "falha_pagamento"]); // Guard: nunca sobrescrever 'paga'
```

### Correcao do #159

Substituir `.single()` por `.maybeSingle()` nas linhas 57, 69 e 99. Tratar ausencias com retorno gracioso:
```text
// Linha 57
.maybeSingle();
if (invoiceError || !invoice) {
  console.warn("Invoice not found for notification:", payload.invoice_id);
  return new Response(JSON.stringify({ success: false, skipped: true, reason: "Invoice not found" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
}

// Linha 69
.maybeSingle();
if (studentError || !student) {
  console.warn("Student not found for notification:", invoice.student_id);
  return new Response(JSON.stringify({ success: false, skipped: true, reason: "Student not found" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
}

// Linha 99
.maybeSingle();
if (teacherError || !teacher) {
  console.warn("Teacher not found for notification:", invoice.teacher_id);
  return new Response(JSON.stringify({ success: false, skipped: true, reason: "Teacher not found" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
}
```

### Correcao do #160

Adicionar verificacao de payment_origin nos 3 handlers de falha do webhook:

**invoice.payment_failed (linha 372):**
```text
case 'invoice.payment_failed': {
  const failedInvoice = eventObject as Stripe.Invoice;
  logStep("Invoice payment failed", { invoiceId: failedInvoice.id });

  // Guard: verificar se ja foi paga manualmente
  const { data: existingFailed } = await supabaseClient
    .from('invoices')
    .select('payment_origin, status')
    .eq('stripe_invoice_id', failedInvoice.id)
    .maybeSingle();

  if (existingFailed?.payment_origin === 'manual' || existingFailed?.status === 'paga' || existingFailed?.status === 'paid') {
    logStep("Invoice already paid/manual, skipping failure update", { invoiceId: failedInvoice.id });
    break;
  }

  const { error: failedError } = await supabaseClient
    .from('invoices')
    .update({ status: 'falha_pagamento', updated_at: new Date().toISOString() })
    .eq('stripe_invoice_id', failedInvoice.id)
    .not('payment_origin', 'eq', 'manual'); // Double guard
  ...
}
```

**invoice.marked_uncollectible (linha 396):** Mesmo padrao.

**payment_intent.payment_failed (linha 504):**
```text
// Guard: verificar se ja foi paga manualmente
const { data: existingPIFailed } = await supabaseClient
  .from('invoices')
  .select('payment_origin, status')
  .eq('stripe_payment_intent_id', paymentIntent.id)
  .maybeSingle();

if (existingPIFailed?.payment_origin === 'manual' || existingPIFailed?.status === 'paga' || existingPIFailed?.status === 'paid') {
  logStep("Invoice already paid/manual, skipping PI failure update", { paymentIntentId: paymentIntent.id });
  break;
}
```

### Correcao do #161

Substituir na linha 107:
```text
const { data: dependent } = await supabaseClient
  .from('dependents')
  .select('name, responsible_id')
  .eq('id', dependent_id)
  .maybeSingle();

if (!dependent) {
  return new Response(JSON.stringify({ 
    success: false, 
    error: 'Dependente nao encontrado' 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 404,
  });
}
```

### Correcao do #162

**Linha 154:**
```text
.eq('teacher_id', user.id)
.maybeSingle();

if (relationshipError || !relationship) {
  logStep("Relationship not found", { error: relationshipError, billingStudentId });
  return new Response(JSON.stringify({
    success: false,
    error: "Relacionamento professor-aluno nao encontrado"
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 404,
  });
}
```

**Linha 382:**
```text
.eq('teacher_id', user.id)
.maybeSingle(); // Dados de guardiao sao opcionais
```

---

## Pontas Soltas Pendentes da v5.19 (Ainda Nao Implementadas)

As seguintes pontas da v5.19 foram documentadas mas **ainda nao implementadas**:
- **#152**: process-orphan-cancellation-charges — verificacao de erro APOS filtragem (CONFIRMADO no codigo atual, linhas 94-97)
- **#153**: create-payment-intent-connect — `.single()` na linha 51 (CONFIRMADO)
- **#154**: change-payment-method — `.single()` na linha 53 (CONFIRMADO — ja tem join FK na mesma query)
- **#155**: check-overdue-invoices — guard clause ausente no UPDATE (CONFIRMADO, linhas 56-59)
- **#156**: auto-verify-pending-invoices — guard clause ausente no UPDATE (CONFIRMADO, linhas 91-98)

---

## Resumo Consolidado (v5.20)

| Categoria | Total v5.19 | Novos Itens | Total v5.20 |
|-----------|-------------|-------------|-------------|
| Pontas soltas | 156 | 6 (#157-#162) | 162 |
| Implementadas | 8 | 0 | 8 |
| Pendentes | 148 | +6 | 154 |
| Melhorias | 52 | 0 | 52 |
| Funcoes cobertas | 48 | +3 (verify-payment-status, send-invoice-notification, process-cancellation) | 51 |

## Prioridade de Implementacao (Batch 1 — Criticos)

Os seguintes bugs podem causar **perda financeira** e devem ser implementados PRIMEIRO:

1. **#155** — check-overdue-invoices: guard clause `.eq("status", "pendente")` no UPDATE
2. **#158** — verify-payment-status: guard clause `.in("status", ["pendente", "falha_pagamento"])` no UPDATE  
3. **#160** — webhook-stripe-connect: verificacao de `payment_origin` nos 3 handlers de falha
4. **#156** — auto-verify-pending-invoices: guard clause `.in("status", ["pendente", "falha_pagamento"])` no UPDATE

Estes 4 bugs compartilham o mesmo padrao: **UPDATE sem guard clause permite sobrescrever status terminal (`paga`/`paid`)**. A correcao e simples (1 linha adicional por UPDATE) e elimina o risco de perda financeira.

## Nota sobre Completude

As 6 novas pontas foram encontradas em 5 funcoes: 2 novas na cobertura (verify-payment-status, send-invoice-notification) e 3 ja parcialmente cobertas (webhook-stripe-connect, process-cancellation, create-invoice). O total de funcoes cobertas sobe para 51 de 75 (68%). As 24 funcoes restantes sao utilitarias/infraestrutura sem impacto no fluxo financeiro.

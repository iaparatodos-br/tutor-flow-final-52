

# Auditoria Profunda v5.22 — 6 Novas Pontas Soltas Identificadas

## Resumo

Revisao exaustiva do codigo atual de todas as Edge Functions financeiras contra as 168 pontas soltas existentes revelou **6 novas pontas soltas (#169-#174)** em 6 funcoes. Totais atualizados: **174 pontas soltas** (8 implementadas, 166 pendentes) e **52 melhorias**.

---

## Novas Pontas Soltas (v5.22)

### #169 -- webhook-stripe-connect e cancel-payment-intent usam status 'paid' em vez de 'paga' (Batch 1 -- CRITICO)

**Arquivos**:
- `supabase/functions/webhook-stripe-connect/index.ts` (linhas 320, 358, 469)
- `supabase/functions/cancel-payment-intent/index.ts` (linhas 111, 172)

```text
// webhook-stripe-connect, linha 320 (invoice.paid handler):
.update({ status: 'paid', ... })

// webhook-stripe-connect, linha 358 (invoice.payment_succeeded handler):
.update({ status: 'paid', ... })

// webhook-stripe-connect, linha 469 (payment_intent.succeeded handler):
.update({ status: "paid", ... })

// cancel-payment-intent, linha 111:
.update({ status: 'paid', ... })

// cancel-payment-intent, linha 172:
.update({ status: 'paid', ... })
```

O padrao documentado do projeto exige que o status de pagamento concluido seja `'paga'` (portugues). Porem, estas 5 ocorrencias escrevem `'paid'` (ingles). Isso causa **inconsistencia critica**:

- `auto-verify-pending-invoices` escreve `'paga'` (linha 84)
- `verify-payment-status` escreve `'paga'` (linha 83)
- `check-overdue-invoices` filtra por `.eq("status", "pendente")` — nao afeta 'paid'/'paga' diretamente, mas a UI e outros cron jobs podem filtrar por 'paga' e nunca encontrar faturas pagas via webhook

**Cenario concreto**: Aluno paga boleto → Stripe envia `payment_intent.succeeded` → webhook grava `status: 'paid'` → cron job de auto-verify busca por `status: pendente` (nao toca 'paid') → fatura aparece como "paga" no banco mas pode nao ser reconhecida por filtros da UI que buscam por 'paga'.

**Impacto**: CRITICO — Inconsistencia de dados no campo mais importante do sistema financeiro. Todas as faturas pagas via Stripe ou confirmacao manual ficam com status diferente das pagas via auto-verify.

**Acao**: Substituir TODOS os `'paid'` por `'paga'` nas 5 ocorrencias:
```text
// webhook-stripe-connect (3 handlers):
.update({ status: 'paga', ... })

// cancel-payment-intent (2 locais):
.update({ status: 'paga', ... })
```

---

### #170 -- change-payment-method: filtro `.eq()` duplicado causa falha na verificacao de autorizacao (Batch 1 -- CRITICO)

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 83-86)

```text
const { data: responsibleRelation } = await supabaseClient
  .from('dependents')
  .select('id')
  .eq('responsible_id', invoice.student_id)  // PRIMEIRO .eq()
  .eq('responsible_id', user.id)              // SEGUNDO .eq() — SOBRESCREVE O PRIMEIRO!
  .limit(1);
```

Conforme documentado na memoria de constraints (`sobreposicao-filtros-query-supabase`), chamadas consecutivas de `.eq()` na mesma coluna se sobrepoem. Aqui, o segundo `.eq('responsible_id', user.id)` sobrescreve o primeiro `.eq('responsible_id', invoice.student_id)`.

**Resultado**: A query efetiva e `.eq('responsible_id', user.id)` — se o usuario tem QUALQUER dependente (independente de estar relacionado ao student_id da fatura), `isGuardian` sera `true`. Isso permite que um responsavel altere o metodo de pagamento de faturas de OUTROS alunos, nao apenas dos seus dependentes.

**Impacto**: CRITICO — Bypass de autorizacao. Um usuario pode alterar metodos de pagamento de faturas de alunos que nao sao seus dependentes.

**Acao**: Usar `.or()` ou reestruturar a logica:
```text
// Opcao 1: Verificar se o student_id da fatura E o responsible_id do usuario
const { data: responsibleRelation } = await supabaseClient
  .from('dependents')
  .select('id')
  .eq('responsible_id', user.id)
  .limit(1);

// Verificar se o user.id === invoice.student_id (ele e o responsavel que recebe a fatura)
if (responsibleRelation && responsibleRelation.length > 0 && invoice.student_id === user.id) {
  isGuardian = true;
}
```

---

### #171 -- generate-boleto-for-invoice usa FK joins para student e teacher profiles (Batch 2 -- ALTA)

**Arquivo**: `supabase/functions/generate-boleto-for-invoice/index.ts` (linhas 36-45)

```text
const { data: invoice, error: invoiceError } = await supabaseClient
  .from("invoices")
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(
      id, name, email, cpf,
      address_street, address_city, address_state, address_postal_code, address_complete
    ),
    teacher:profiles!invoices_teacher_id_fkey(name, email)
  `)
  .eq("id", invoice_id)
  .maybeSingle();
```

Viola a constraint de FK joins proibidos em Edge Functions. Se o cache de schema do Deno falhar, `invoice.student` retorna `null` e toda a logica de validacao de CPF/endereco falha — o boleto nao e gerado e o aluno nao recebe notificacao de pagamento.

**Impacto**: ALTO — Funcao critica para geracao de pagamentos. Falha de cache impede geracao de boletos.

**Acao**: Separar em 3 queries sequenciais:
```text
// 1. Buscar fatura
const { data: invoice } = await supabaseClient
  .from("invoices")
  .select("*")
  .eq("id", invoice_id)
  .maybeSingle();

// 2. Buscar student profile
const { data: student } = await supabaseClient
  .from("profiles")
  .select("id, name, email, cpf, address_street, address_city, address_state, address_postal_code, address_complete")
  .eq("id", invoice.student_id)
  .maybeSingle();

// 3. Buscar teacher profile
const { data: teacher } = await supabaseClient
  .from("profiles")
  .select("name, email")
  .eq("id", invoice.teacher_id)
  .maybeSingle();
```

---

### #172 -- automated-billing usa FK join em verificacao de aulas confirmadas antigas (Batch 3 -- MEDIA)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 213-226)

```text
const { data: oldConfirmedParticipations, error: oldClassesError } = await supabaseAdmin
  .from('class_participants')
  .select(`
    id,
    classes!inner (
      id,
      class_date,
      status,
      teacher_id
    )
  `)
  .eq('student_id', studentInfo.student_id)
  .eq('classes.teacher_id', studentInfo.teacher_id)
  .eq('status', 'confirmada')
  .lt('classes.class_date', thirtyDaysAgo.toISOString());
```

Usa FK join `classes!inner` com filtros aninhados (`.eq('classes.teacher_id', ...)`). Embora esta seja uma verificacao diagnostica (apenas log de alerta), a falha de cache pode gerar logs incorretos e mascarar aulas orfas.

**Impacto**: MEDIO — Funcao diagnostica apenas, mas pode causar falsos negativos no alerta.

**Acao**: Separar em queries sequenciais ou remover se o alerta nao e acionavel.

---

### #173 -- webhook-stripe-connect: `.single()` em 3 handlers de verificacao payment_origin (Batch 3 -- MEDIA)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 310, 346, 456)

```text
// Linha 310 (invoice.paid handler):
const { data: existingInvoice } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_invoice_id', paidInvoice.id)
  .single();  // ← Lanca 500 se nao encontrar

// Linha 346 (invoice.payment_succeeded handler):
const { data: existingSucceeded } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_invoice_id', succeededInvoice.id)
  .single();  // ← Lanca 500 se nao encontrar

// Linha 456 (payment_intent.succeeded handler):
const { data: existingPI } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_payment_intent_id', paymentIntent.id)
  .single();  // ← Lanca 500 se nao encontrar
```

Se a fatura local nao existir para um evento Stripe (ex: pagamento de fatura do Stripe nao rastreada pelo sistema), `.single()` lanca excecao e o webhook retorna HTTP 500. O Stripe re-envia o evento repetidamente, causando ruido nos logs e potencial throttling.

**Impacto**: MEDIO — Webhooks falham para eventos de faturas nao rastreadas. O Stripe re-tenta e eventualmente para de enviar eventos ao endpoint.

**Acao**: Trocar por `.maybeSingle()` e verificar existencia:
```text
const { data: existingInvoice } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_invoice_id', paidInvoice.id)
  .maybeSingle();

if (!existingInvoice) {
  logStep("No local invoice found for Stripe invoice", { invoiceId: paidInvoice.id });
  break; // Skip gracefully
}
```

---

### #174 -- cancel-payment-intent: `.single()` no lookup de fatura (Batch 5 -- MEDIA)

**Arquivo**: `supabase/functions/cancel-payment-intent/index.ts` (linha 71)

```text
const { data: invoice, error: invoiceError } = await supabase
  .from('invoices')
  .select('id, teacher_id, stripe_payment_intent_id, status, payment_origin')
  .eq('id', invoice_id)
  .single();
```

Se o `invoice_id` fornecido nao existir (UUID invalido ou fatura deletada), `.single()` lanca excecao com HTTP 500 em vez de retornar 404 amigavel. O catch generico na linha 240 retorna "Failed to cancel payment intent" sem contexto.

**Impacto**: MEDIO — UX degradada para o professor ao tentar confirmar pagamento de fatura inexistente.

**Acao**: Trocar por `.maybeSingle()` com retorno 404 explicito (o check na linha 73 ja trata).

---

## Atualizacoes no Plano

### Cabecalho e Totais

- Titulo: `v5.21` para `v5.22`
- Totais: `168 pontas soltas` para `174 pontas soltas` (8 implementadas, 166 pendentes)

### Tabela de Cobertura (expandir/adicionar entradas)

| Funcao | Pontas Documentadas (atualizado) |
|--------|--------------------------------|
| automated-billing | #163, **#172** |
| create-invoice | #61, #62, #162, #164, #165 |
| process-cancellation | #5.1, #5.2, #107, #161, #166 |
| handle-student-overage | #167 |
| send-cancellation-notification | #168 |
| verify-payment-status | #157, #158 |
| send-invoice-notification | #159 |
| webhook-stripe-connect | #86, #160, **#169, #173** |
| cancel-payment-intent | **#169, #174** |
| change-payment-method | #114, #115, #154, **#170** |
| generate-boleto-for-invoice | #103, #121, #148, #151, **#171** |
| process-orphan-cancellation-charges | #105, #106, #123, #149, #150, #152 |
| create-payment-intent-connect | #119, #153 |
| check-overdue-invoices | #41, #47, #56, #71, #81, #95, #126, #155 |
| auto-verify-pending-invoices | M52, #156 |

### Padroes Transversais (atualizar contagens)

- **`.single()` vs `.maybeSingle()`**: adicionar #173, #174 (total: **24 funcoes afetadas**)
- **FK joins proibidos**: adicionar #171, #172 (total: funcoes com FK joins conhecidos agora incluem automated-billing x2, create-invoice x2, generate-boleto-for-invoice, create-payment-intent-connect, change-payment-method)
- **Status inconsistente 'paid' vs 'paga'**: #169 (NOVO padrao — 5 ocorrencias em 2 funcoes)
- **Filtro `.eq()` duplicado na mesma coluna**: #170 (NOVO padrao de seguranca)

### Roadmap de Batches

| # | Batch | Severidade | Justificativa |
|---|-------|-----------|---------------|
| #169 | 1 (Critico) | CRITICO | Status inconsistente 'paid'/'paga' — dados financeiros corrompidos em 5 locais |
| #170 | 1 (Critico) | CRITICO | Bypass de autorizacao em change-payment-method — qualquer responsavel pode alterar faturas de outros alunos |
| #171 | 2 (FK Joins) | ALTA | FK join em funcao critica de geracao de pagamentos |
| #172 | 3 (FK/Diagnostico) | MEDIA | FK join em verificacao diagnostica — impacto menor |
| #173 | 3 (Webhook) | MEDIA | `.single()` em webhook causa re-tentativas desnecessarias do Stripe |
| #174 | 5 (UX) | MEDIA | `.single()` em cancel-payment-intent — UX degradada |

---

## Prioridade de Implementacao Atualizada (Batch 1 — Criticos)

Os seguintes bugs podem causar **perda financeira ou falha de seguranca** e devem ser implementados PRIMEIRO:

1. **#166** — process-cancellation → create-invoice: auth failure silenciosa — **COBRANÇAS DE CANCELAMENTO NUNCA CRIADAS** (PERDA ATIVA)
2. **#169** — webhook-stripe-connect + cancel-payment-intent: status 'paid' em vez de 'paga' — **INCONSISTENCIA DE DADOS EM 5 LOCAIS**
3. **#170** — change-payment-method: bypass de autorizacao por filtro `.eq()` duplicado — **FALHA DE SEGURANCA**
4. **#155** — check-overdue-invoices: guard clause `.eq("status", "pendente")` no UPDATE
5. **#158** — verify-payment-status: guard clause `.in("status", ["pendente", "falha_pagamento"])` no UPDATE
6. **#160** — webhook-stripe-connect: verificacao de `payment_origin` nos 3 handlers de falha
7. **#156** — auto-verify-pending-invoices: guard clause `.in("status", ["pendente", "falha_pagamento"])` no UPDATE

**#169 e #170 sao os bugs mais impactantes desta auditoria**:
- #169 afeta TODAS as faturas pagas via Stripe (a maioria). O status errado pode quebrar filtros da UI, relatorios financeiros e cron jobs.
- #170 e um bypass de autorizacao ativo — qualquer usuario com dependentes pode alterar metodos de pagamento de faturas de outros alunos.

---

## Pontas Soltas da v5.21 (Ainda Nao Implementadas)

- **#152**: process-orphan-cancellation-charges — verificacao de erro APOS filtragem
- **#153**: create-payment-intent-connect — `.single()` na linha 51
- **#154**: change-payment-method — `.single()` na linha 53
- **#155**: check-overdue-invoices — guard clause ausente no UPDATE (CRITICO)
- **#156**: auto-verify-pending-invoices — guard clause ausente no UPDATE (CRITICO)
- **#157**: verify-payment-status — `.single()` na linha 40
- **#158**: verify-payment-status — guard clause ausente no UPDATE (CRITICO)
- **#159**: send-invoice-notification — `.single()` em 3 lookups
- **#160**: webhook-stripe-connect — verificacao de payment_origin ausente (CRITICO)
- **#161**: process-cancellation — `.single()` na linha 107
- **#162**: create-invoice — `.single()` nas linhas 154, 382
- **#163**: automated-billing — FK joins na query principal (ALTA)
- **#164**: create-invoice — FK join para relationship (MEDIA)
- **#165**: create-invoice — FK joins aninhados para classes (MEDIA)
- **#166**: process-cancellation — auth failure com service_role key (CRITICO)
- **#167**: handle-student-overage — `.single()` (MEDIA)
- **#168**: send-cancellation-notification — `.single()` em 4 lookups (BAIXA)

---

## Resumo Consolidado (v5.22)

| Categoria | Total v5.21 | Novos Itens | Total v5.22 |
|-----------|-------------|-------------|-------------|
| Pontas soltas | 168 | 6 (#169-#174) | 174 |
| Implementadas | 8 | 0 | 8 |
| Pendentes | 160 | +6 | 166 |
| Melhorias | 52 | 0 | 52 |
| Funcoes auditadas | 51 | +3 | 54 |

### Novos Padroes Identificados nesta Auditoria

1. **Inconsistencia de status terminal**: Funcoes que escrevem diretamente no Stripe (webhooks, cancel-payment-intent) usam terminologia inglesa ('paid'), enquanto cron jobs internos (auto-verify, verify-payment-status) usam portugues ('paga'). Potencial de dados corrompidos.

2. **Bypass de autorizacao por `.eq()` duplicado**: O PostgREST sobrescreve filtros consecutivos na mesma coluna. Quando usado em logica de autorizacao (como em change-payment-method), a segunda condicao anula a primeira, criando um bypass.

3. **FK joins em funcoes de pagamento**: generate-boleto-for-invoice depende de FK joins para dados criticos do pagador (CPF, endereco). Falha de cache impede geracao de boletos.

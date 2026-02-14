

# Auditoria Profunda v5.19 — 5 Novas Pontas Soltas Identificadas

## Resumo

Revisao exaustiva do codigo atual de todas as Edge Functions financeiras contra as 151 pontas soltas existentes revelou **5 novas pontas soltas (#152-#156)** em 4 funcoes. Totais atualizados: **156 pontas soltas** (8 implementadas, 148 pendentes) e **52 melhorias**.

---

## Novas Pontas Soltas

### #152 -- process-orphan-cancellation-charges verificacao de erro APOS filtragem de dados (Batch 4 -- MEDIA)

**Arquivo**: `supabase/functions/process-orphan-cancellation-charges/index.ts` (linhas 33-97)

A variavel `orphanError` da query principal (linha 33) so e verificada na **linha 94**, APOS 3 blocos de filtragem:
1. Filtro de participantes ja faturados (linhas 63-72)
2. Filtro #150 de aulas gratuitas (linhas 74-92)
3. Verificacao de tamanho do array (linha 99)

Se a query retornar erro parcial (ex: timeout com dados incompletos), as filtragens processam dados potencialmente corrompidos/incompletos. O filtro #150 faz uma query adicional ao banco (`classes`) baseada em IDs de dados possivelmente invalidos.

**Acao**: Mover a verificacao `if (orphanError)` para imediatamente apos a query (entre linhas 60 e 62, antes dos blocos de filtragem).

---

### #153 -- create-payment-intent-connect usa `.single()` sem tratamento semantico (Batch 5 -- ALTA)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linha 51)

```text
.eq("id", invoice_id)
.single();
```

A funcao central de geracao de pagamentos (Boleto, PIX, Cartao) usa `.single()` na query de fatura. Se o `invoice_id` nao existir, `.single()` retorna erro em `invoiceError`, capturado pelo check `if (invoiceError || !invoice)` na linha 53, que lanca `throw new Error("Invoice not found")`. Isso resulta em HTTP 500 generico com mensagem tecnica.

Esta funcao e chamada por:
- `create-invoice` (faturas manuais/prepaid)
- `automated-billing` (faturas automatizadas)
- `generate-boleto-for-invoice` (geracao manual de boleto)
- `change-payment-method` (troca de metodo)

A ponta #119 documenta FK joins nesta funcao, mas o `.single()` nunca foi documentado como ponta separada. O impacto e ALTO pois e o ponto unico de falha para todos os pagamentos.

**Acao**: Trocar `.single()` por `.maybeSingle()`. Tratar `!invoice` com HTTP 404 e mensagem amigavel: `{ success: false, error: "Fatura nao encontrada" }`.

---

### #154 -- change-payment-method usa `.single()` sem tratamento semantico (Batch 5 -- MEDIA)

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linha 53)

```text
.eq("id", invoice_id)
.single();
```

Mesmo padrao do #153. Se a fatura nao existir, retorna HTTP 500 com "Invoice not found". A ponta #114 documenta FK joins, mas o `.single()` nao foi documentado.

**Acao**: Trocar `.single()` por `.maybeSingle()`. Se `!invoice`, retornar HTTP 404 com `{ success: false, error: "Fatura nao encontrada" }`.

---

### #155 -- check-overdue-invoices nao tem guard clause `status = 'pendente'` no UPDATE (Batch 1 -- ALTA)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 56-59)

```text
await supabase
  .from("invoices")
  .update({ status: "overdue" })
  .eq("id", invoice.id);
```

A ponta #81 (ja documentada) identifica esta race condition, mas o codigo ATUAL confirma que a correcao **nunca foi implementada**. A ponta #95 tambem a identifica como duplicata. O update nao inclui `.eq("status", "pendente")` como guard clause.

**Cenario**: Entre a busca (linha 27-31, `status = 'pendente'`) e o update (linha 57-59), um webhook Stripe pode processar o pagamento e atualizar para `paga`. O update sobrescreve `paga` → `overdue`, revertendo uma fatura ja paga.

A memoria `payment/protecao-reversao-status-fatura` define: "Transicoes de estado devem incluir verificacao de guarda para garantir que o status atual nao seja 'paga'."

**Acao**: Adicionar `.eq('status', 'pendente')` ao update:
```text
await supabase
  .from("invoices")
  .update({ status: "overdue" })
  .eq("id", invoice.id)
  .eq("status", "pendente"); // Guard clause contra race condition
```

Nota: Esta e uma **re-priorizacao** de #81/#95 para Batch 1 (CRITICO), pois a revisao confirma que o bug esta presente no codigo atual e pode causar perda financeira.

---

### #156 -- auto-verify-pending-invoices nao tem guard clause de status no UPDATE — mesma race condition do #155 (Batch 4 -- MEDIA)

**Arquivo**: `supabase/functions/auto-verify-pending-invoices/index.ts` (linhas 91-98)

```text
const { error: updateError } = await supabaseClient
  .from("invoices")
  .update({ 
    status: newStatus,
    payment_origin: paymentIntent.status === 'succeeded' ? 'automatic' : undefined,
    updated_at: new Date().toISOString()
  })
  .eq("id", invoice.id);
```

Mesmo padrao do #155 mas nesta funcao cron de verificacao automatica. O UPDATE nao verifica o status atual antes de modificar. Se um webhook processar o pagamento entre a busca e o update, o status pode ser sobrescrito.

Cenarios de risco:
1. `auto-verify` le fatura como `pendente`, webhook atualiza para `paga` com `payment_origin: 'automatic'`, `auto-verify` sobrescreve com `paga` novamente (neste caso sem dano)
2. `auto-verify` le fatura como `pendente`, webhook atualiza para `paga`, PI no Stripe esta `canceled` (outro PI), `auto-verify` sobrescreve para `falha_pagamento` — **PERDA DE DADOS**

**Acao**: Adicionar guard clause no update:
```text
.eq("id", invoice.id)
.in("status", ["pendente", "falha_pagamento"]) // Nunca sobrescrever 'paga'
```

---

## Atualizacoes no Plano

### Cabecalho e Totais

- Titulo: `v5.18` para `v5.19`
- Totais: `151 pontas soltas` para `156 pontas soltas` (8 implementadas, 148 pendentes)
- Implementadas: +2 (#148, #151 da v5.18)

### Tabela de Cobertura (expandir entradas existentes)

| Funcao | Pontas Documentadas (atualizado) |
|--------|--------------------------------|
| process-orphan-cancellation-charges | #105, #106, #123, #149, #150, **#152** |
| create-payment-intent-connect | #119, **#153** |
| change-payment-method | #114, #115, **#154** |
| check-overdue-invoices | #41, #47, #56, #71, #81, #95, #126, **#155** |
| auto-verify-pending-invoices | M52, **#156** |

### Padroes Transversais (atualizar contagens)

- **`.single()` vs `.maybeSingle()`**: adicionar #153, #154 (total: 16 funcoes afetadas)
- **Guard clause de status ausente no UPDATE**: adicionar #155, #156 (novo padrao transversal — total: 3 funcoes: check-overdue, auto-verify, webhook-stripe-connect #86)
- **Verificacao de erro deferida**: #152 (novo padrao)

### Roadmap de Batches

| # | Batch | Severidade | Justificativa |
|---|-------|-----------|---------------|
| #152 | 4 (RPC/Billing) | MEDIA | Dados corrompidos processados antes de verificacao de erro |
| #153 | 5 (FK/Query) | ALTA | `.single()` na funcao central de pagamentos — HTTP 500 generico |
| #154 | 5 (FK/Query) | MEDIA | `.single()` em funcao de troca de metodo de pagamento |
| #155 | 1 (Critico) | ALTA | Race condition pode reverter fatura paga para overdue — re-priorizacao de #81/#95 |
| #156 | 4 (RPC/Billing) | MEDIA | Guard clause ausente em cron de verificacao automatica |

---

## Secao Tecnica

### Correcao do #152

Mover o check de erro para imediatamente apos a query:
```text
// Linha 60 (apos a query)
if (orphanError) {
  logStep("Error fetching orphan participants", orphanError);
  throw orphanError;
}

// Linha 62+ (filtragens seguras)
if (orphanParticipants) {
  // ... filtro de ja faturados
}
```

Remover o check duplicado na linha 94.

### Correcao do #153

Substituir na linha 51:
```text
.eq("id", invoice_id)
.maybeSingle();

if (invoiceError) {
  logStep("Error fetching invoice", invoiceError);
  throw new Error("Erro ao buscar fatura");
}

if (!invoice) {
  return new Response(JSON.stringify({ 
    success: false, 
    error: "Fatura nao encontrada" 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 404,
  });
}
```

### Correcao do #154

Substituir na linha 53:
```text
.eq("id", invoice_id)
.maybeSingle();

if (invoiceError) {
  logStep("Error fetching invoice", invoiceError);
  throw new Error("Erro ao buscar fatura");
}

if (!invoice) {
  return new Response(JSON.stringify({ 
    success: false, 
    error: "Fatura nao encontrada" 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 404,
  });
}
```

### Correcao do #155

Substituir na linha 57-59:
```text
await supabase
  .from("invoices")
  .update({ status: "overdue" })
  .eq("id", invoice.id)
  .eq("status", "pendente");
```

### Correcao do #156

Substituir na linha 91-98:
```text
const { error: updateError } = await supabaseClient
  .from("invoices")
  .update({ 
    status: newStatus,
    payment_origin: paymentIntent.status === 'succeeded' ? 'automatic' : undefined,
    updated_at: new Date().toISOString()
  })
  .eq("id", invoice.id)
  .in("status", ["pendente", "falha_pagamento"]);
```

---

## Resumo Consolidado (v5.19)

| Categoria | Total v5.18 | Novos Itens | Total v5.19 |
|-----------|-------------|-------------|-------------|
| Pontas soltas | 151 | 5 (#152-#156) | 156 |
| Implementadas | 6 | +2 (#148, #151) | 8 |
| Pendentes | 145 | +3 (net) | 148 |
| Melhorias | 52 | 0 | 52 |
| Funcoes cobertas | 47 | +1 (auto-verify) | 48 |

## Nota sobre Completude

As 5 novas pontas foram encontradas em funcoes ja parcialmente cobertas (#119 para create-payment-intent, #114/#115 para change-payment-method, #81/#95 para check-overdue) e uma funcao com cobertura apenas de melhoria (#auto-verify via M52). A re-priorizacao de #155 de Batch 8 para Batch 1 reflete a confirmacao de que o bug esta presente no codigo atual. A cobertura de 100% das 75 Edge Functions permanece valida com 48 funcoes mapeadas na tabela de cobertura.

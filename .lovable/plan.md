

# Auditoria Profunda v5.18 — 4 Novas Pontas Soltas Identificadas

## Resumo

Revisao exaustiva de todas as 75 Edge Functions contra as 147 pontas soltas existentes revelou **4 novas pontas soltas (#148-#151)** em 2 funcoes ja parcialmente cobertas (`generate-boleto-for-invoice` e `process-orphan-cancellation-charges`) e 1 confirmacao de cobertura completa das demais. Totais atualizados: **151 pontas soltas** (6 implementadas) e **52 melhorias**.

---

## Novas Pontas Soltas

### #148 -- generate-boleto-for-invoice usa `.single()` sem tratamento semantico (Batch 8 -- BAIXA)

**Arquivo**: `supabase/functions/generate-boleto-for-invoice/index.ts` (linha 45)

```text
.eq("id", invoice_id)
.single();
```

A query de fatura usa `.single()`. Se a fatura nao existir (ex: ID invalido, fatura deletada entre a acao do usuario e a chamada), a funcao lanca excecao capturada pelo catch generico que retorna HTTP 500 com mensagem tecnica `"Invoice not found"`. 

A ponta #103 (ja documentada) cobre os FK joins nessa mesma query, mas o `.single()` na **propria query** nunca foi documentado. Combinado com a ausencia de autenticacao (#121), um atacante que envie IDs invalidos recebera stack traces no response body.

**Acao**: Trocar `.single()` por `.maybeSingle()`. Se `invoice` for null, retornar `{ success: false, error: "Fatura nao encontrada" }` com HTTP 404.

---

### #149 -- process-orphan-cancellation-charges usa `.single()` em 2 lookups internos (Batch 5 -- MEDIA)

**Arquivo**: `supabase/functions/process-orphan-cancellation-charges/index.ts` (linhas 104, 111)

```text
// Linha 104: teacher profile
.eq('id', classData.teacher_id)
.single();

// Linha 111: relationship
.eq('teacher_id', classData.teacher_id)
.eq('student_id', participant.student_id)
.single();
```

Dentro do loop de processamento de cada participante orfao:

1. **Linha 104** (`profiles` do professor): Se o professor foi deletado ou desativado, `.single()` lanca excecao. O catch do loop captura e incrementa `errorCount`, mas o erro impede o processamento de TODOS os participantes daquele grupo (mesma iteracao `for...of`), nao apenas o afetado.

2. **Linha 111** (`teacher_student_relationships`): Se o relacionamento foi encerrado (aluno removido), `.single()` lanca excecao. O `business_profile_id` nao e recuperado, e a fatura orfao nao e criada para nenhum participante do grupo.

As pontas #105 (RPC incorreta), #106 (sem geracao de pagamento) e #123 (FK joins) ja cobrem outros aspectos dessa funcao, mas os `.single()` internos nunca foram documentados.

**Acao**: Trocar ambos por `.maybeSingle()`. Se `teacherData` for null, pular o grupo com log de warning. Se `relationshipData` for null, usar `business_profile_id = null` e deixar a validacao existente (linha 156) pular o grupo graciosamente.

---

### #150 -- process-orphan-cancellation-charges nao filtra por `is_paid_class` (Batch 4 -- MEDIA)

**Arquivo**: `supabase/functions/process-orphan-cancellation-charges/index.ts` (linhas 33-60)

A query principal busca `class_participants` com `status = 'cancelada'` e `charge_applied = true`, sem filtrar por `is_paid_class` da aula vinculada. Quando a cobranca hibrida estiver ativa:

- **Aulas gratuitas** (`is_paid_class = false`): O `process-cancellation` devera forcar `shouldCharge = false` (pontas #5.1, #107), entao `charge_applied` nunca deveria ser `true`. Mas se houver um bug ou dado legado, a funcao criara cobranças orfaos para aulas gratuitas.

- **Aulas pre-pagas** (`charge_timing = 'prepaid'`): O `process-cancellation` devera forcar `shouldCharge = false` (ponta #5.2), entao `charge_applied` tambem nunca deveria ser `true`. Mas novamente, se houver inconsistencia, cobranças orfaos serao geradas para aulas ja pagas antecipadamente.

Esta ponta e uma **defesa em profundidade** contra falhas nas pontas #5.1, #5.2 e #107.

**Acao**: Apos buscar os participantes orfaos (linha 60), buscar os dados das `classes` correspondentes incluindo `is_paid_class`. Filtrar participantes cujas aulas tenham `is_paid_class = false`. Adicionalmente, buscar `charge_timing` do `business_profiles` do professor e filtrar aulas com `charge_timing = 'prepaid'` (onde a cobranca de cancelamento nao deveria existir). Logar como warning cada participante filtrado por essa defesa.

---

### #151 -- generate-boleto-for-invoice nao verifica status da fatura antes de gerar pagamento (Batch 5 -- MEDIA)

**Arquivo**: `supabase/functions/generate-boleto-for-invoice/index.ts` (linhas 34-49)

A funcao aceita qualquer `invoice_id` e gera um boleto sem verificar o `status` atual da fatura. Se a fatura ja estiver `paga`, `cancelada` ou `vencida`, um novo boleto sera gerado desnecessariamente, criando um Payment Intent orfao no Stripe e potencialmente permitindo pagamento duplo.

Comparando com `change-payment-method` (linha 124-128) que valida `allowedStatuses = ['pendente', 'open', 'falha_pagamento']`, e com `cancel-payment-intent` que verifica `payment_origin`, esta funcao nao tem nenhuma guard clause de status.

**Acao**: Apos buscar a fatura, verificar se o status esta em `['pendente', 'open', 'falha_pagamento']`. Se nao, retornar erro amigavel: "Nao e possivel gerar boleto para uma fatura com status [status]". Verificar tambem se ja existe um `stripe_payment_intent_id` ativo (evitar Payment Intents duplicados).

---

## Atualizacoes no Plano

### Cabecalho e Totais

- Titulo: `v5.17` para `v5.18`
- Totais: `147 pontas soltas` para `151 pontas soltas` (6 implementadas, 145 pendentes)

### Tabela de Cobertura (expandir entradas existentes)

| Funcao | Pontas Documentadas (atualizado) |
|--------|--------------------------------|
| generate-boleto-for-invoice | #103, #121, **#148, #151** |
| process-orphan-cancellation-charges | #105, #106, #123, **#149, #150** |

### Padroes Transversais (atualizar contagens)

- **`.single()` vs `.maybeSingle()`**: adicionar #148, #149 (total: 14 funcoes afetadas)
- **Guard clause de status ausente**: adicionar #151 (novo padrao)
- **Filtro `is_paid_class` ausente**: adicionar #150 (complementa #65, #107)

### Roadmap de Batches

| # | Batch | Severidade | Justificativa |
|---|-------|-----------|---------------|
| #148 | 8 (Polish) | BAIXA | `.single()` semanticamente incorreto + info leak |
| #149 | 5 (FK/Query) | MEDIA | `.single()` em loop — interrompe processamento de grupo inteiro |
| #150 | 4 (RPC/Billing) | MEDIA | Defesa em profundidade contra dados inconsistentes |
| #151 | 5 (FK/Query) | MEDIA | Geracao de Payment Intent orfao + risco de pagamento duplo |

---

## Secao Tecnica

### Correcao do #148

Substituir:
```text
.eq("id", invoice_id)
.single();
```
Por:
```text
.eq("id", invoice_id)
.maybeSingle();

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

### Correcao do #149

Substituir `.single()` por `.maybeSingle()` nas linhas 104 e 111. Adicionar skip gracioso:
```text
const { data: teacherData } = await supabaseAdmin
  .from('profiles')
  .select('id, name, payment_due_days')
  .eq('id', classData.teacher_id)
  .maybeSingle();

if (!teacherData) {
  logStep(`Skipping participant ${participant.id} - teacher profile not found`);
  continue;
}

const { data: relationshipData } = await supabaseAdmin
  .from('teacher_student_relationships')
  .select('business_profile_id')
  .eq('teacher_id', classData.teacher_id)
  .eq('student_id', participant.student_id)
  .maybeSingle();
```

### Correcao do #150

Apos a filtragem de participantes ja faturados (linha 71), adicionar:
```text
// Filtrar participantes cujas aulas sao gratuitas ou pre-pagas
if (orphanParticipants && orphanParticipants.length > 0) {
  const classIds = [...new Set(orphanParticipants.map(p => p.class_id))];
  const { data: classDetails } = await supabaseAdmin
    .from('classes')
    .select('id, is_paid_class, teacher_id')
    .in('id', classIds);

  const paidClassIds = new Set(
    classDetails?.filter(c => c.is_paid_class === true).map(c => c.id) || []
  );

  const beforeCount = orphanParticipants.length;
  orphanParticipants = orphanParticipants.filter(p => paidClassIds.has(p.class_id));
  const filtered = beforeCount - orphanParticipants.length;
  if (filtered > 0) {
    logStep(`Filtered ${filtered} participants from free classes`);
  }
}
```

### Correcao do #151

Apos a query da fatura (linha 45), adicionar guard clause:
```text
const allowedStatuses = ['pendente', 'open', 'falha_pagamento'];
if (!allowedStatuses.includes(invoice.status)) {
  return new Response(JSON.stringify({
    success: false,
    error: `Nao e possivel gerar boleto para fatura com status "${invoice.status}"`
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 400,
  });
}

if (invoice.stripe_payment_intent_id) {
  logStep("Invoice already has a payment intent", { 
    existingPI: invoice.stripe_payment_intent_id 
  });
}
```

---

## Resumo Consolidado (v5.18)

| Categoria | Total v5.17 | Novos Itens | Total v5.18 |
|-----------|-------------|-------------|-------------|
| Pontas soltas | 147 | 4 (#148-#151) | 151 |
| Melhorias | 52 | 0 | 52 |
| Funcoes cobertas | 47 | 0 (expansao de existentes) | 47 |

## Nota sobre Completude

As 4 novas pontas foram encontradas em funcoes **ja parcialmente cobertas** (#103/#121 para `generate-boleto` e #105/#106/#123 para `process-orphan`). Todas as demais funcoes financeiras foram re-verificadas e suas coberturas estao completas. As 27 funcoes fora de escopo foram reconfirmadas como nao impactadas pelo modelo de cobranca hibrida. A cobertura de 100% das 75 Edge Functions permanece valida.




# Revisao v3.1 — Pontas Soltas Remanescentes

Apos revisao cruzada exaustiva entre o documento `docs/hybrid-billing-implementation-plan.md` (v3.1, 177 gaps) e o codigo-fonte real do projeto, identifiquei **6 novas pontas soltas** que precisam ser resolvidas antes da implementacao.

---

## Ponta Solta 10: Handler `payment_intent.succeeded` descrito como patches incrementais — sem codigo completo de substituicao

**Gravidade: ALTA**

O plano fornece um handler COMPLETO de substituicao para `invoice.paid` (secao 5.3, ~110 linhas de codigo). Porem, para `payment_intent.succeeded` (linhas 441-501 do codigo real), o plano descreve MULTIPLOS patches incrementais dispersos pelo documento:

- Gap 53/59: Preservar `payment_origin` existente
- Gap 68: Limpar `stripe_hosted_invoice_url` condicionalmente
- Gap 105: Preservar `payment_origin` existente (duplicado do 53/59)
- Gap 106: Condicional em `stripe_hosted_invoice_url`
- Gap 115: Trocar `.single()` por `.maybeSingle()` com null guard
- Gap 83: `completeEventProcessing` no outer catch

O Gap 125 identificou EXATAMENTE este problema para `invoice.paid` e foi resolvido com handler completo de substituicao. Porem, `payment_intent.succeeded` continua com patches incrementais. O implementador precisaria aplicar 6+ patches manuais ao handler existente (60+ linhas), o que e altamente propenso a erros.

**Resolucao necessaria**: Fornecer handler COMPLETO de substituicao para `payment_intent.succeeded` (mesma abordagem usada para `invoice.paid` na secao 5.3). Ou extrair helper function compartilhado.

---

## Ponta Solta 11: SELECT de `payment_intent.succeeded` nao inclui `stripe_invoice_id` — Gap 68 falha silenciosamente

**Gravidade: ALTA**

O codigo real de `payment_intent.succeeded` (linhas 453-457) faz:

```typescript
const { data: existingPI } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_payment_intent_id', paymentIntent.id)
  .single();
```

O Gap 68 propoe limpar `stripe_hosted_invoice_url` condicionalmente:

```typescript
if (!invoiceToUpdate?.stripe_invoice_id) {
  clearFields.stripe_hosted_invoice_url = null;
}
```

**Problema**: O SELECT atual busca APENAS `payment_origin`. Para a logica do Gap 68 funcionar, o SELECT tambem precisa de `stripe_invoice_id`. Sem esse campo, `existingPI?.stripe_invoice_id` sera SEMPRE `undefined`, e o `stripe_hosted_invoice_url` sera limpo incondicionalmente — anulando o fix proposto pelo Gap 68.

**Resolucao necessaria**: Atualizar o SELECT para incluir `id, payment_origin, stripe_invoice_id, invoice_type`. Documentar na secao que fornece o handler completo de substituicao (Ponta Solta 10).

---

## Ponta Solta 12: Handler `invoice.payment_failed` sem verificacao de `payment_origin === 'manual'`

**Gravidade: MEDIA**

O Gap 86 corrigiu a mesma vulnerabilidade em `invoice.marked_uncollectible`: se o professor marcou manualmente o pagamento como recebido (`payment_origin: 'manual'`), o webhook nao deve sobrescrever o status.

O handler `invoice.payment_failed` (linhas 372-393 do codigo real) tem a MESMA vulnerabilidade:

```typescript
case 'invoice.payment_failed': {
  const failedInvoice = eventObject as Stripe.Invoice;
  // SEM verificacao de payment_origin === 'manual'
  const { error: failedError } = await supabaseClient
    .from('invoices')
    .update({ status: 'falha_pagamento', ... })
    .eq('stripe_invoice_id', failedInvoice.id);
```

**Cenario de risco**:
1. Fatura criada com boleto
2. Professor marca como paga manualmente (`payment_origin: 'manual'`, `status: 'paid'`)
3. Boleto expira → Stripe envia `invoice.payment_failed` com atraso
4. Webhook sobrescreve status `paid` com `falha_pagamento`

**Problema**: O Gap 86 cobre `invoice.marked_uncollectible` mas NAO `invoice.payment_failed`. A mesma logica de protecao deve ser aplicada.

**Resolucao necessaria**: Adicionar verificacao de `payment_origin === 'manual'` no handler `invoice.payment_failed` (mesma abordagem do Gap 86). Incluir no codigo proposto para `invoice.payment_failed` (secao 5.3, linhas 1025-1070 do plano).

---

## Ponta Solta 13: Handler `invoice.payment_succeeded` sem codigo completo — Gap 139 diz "copiar" sem template

**Gravidade: MEDIA**

O Gap 139 (linha 1697 do plano) afirma: "handler `invoice.payment_succeeded` e IDENTICO — copiar integralmente. Melhor: extrair logica em funcao helper."

Porem:
1. NAO fornece o codigo completo do handler (nem como copia nem como referencia a linhas exatas)
2. NAO fornece a funcao helper sugerida
3. O handler `invoice.paid` proposto (secao 5.3, linhas 840-968) tem ~130 linhas de codigo — copiar manualmente e altamente propenso a erros

A sugestao de "extrair helper" e mencionada mas NENHUM codigo e fornecido. Se o implementador copiar manualmente, pode omitir detalhes criticos (ex: `stripeAccountId`, `autoPagingToArray`, filtros de status em `class_participants`).

**Resolucao necessaria**: Uma de duas opcoes:
- Opcao A: Fornecer helper function `processInvoicePaidEvent(supabaseClient, stripe, event, eventObject)` que ambos handlers chamam
- Opcao B: Fornecer codigo completo de substituicao para `invoice.payment_succeeded` (com nota "identico a invoice.paid")

---

## Ponta Solta 14: `send-invoice-notification` rotula `stripe_hosted_invoice_url` como "Pagar com Cartao" — enganoso para faturas prepaid

**Gravidade: MEDIA**

No codigo real de `send-invoice-notification` (linhas 291-295):

```typescript
if (invoice.stripe_hosted_invoice_url) {
  paymentMethods += `
    <p><strong>Cartao de Credito:</strong></p>
    <a href="${invoice.stripe_hosted_invoice_url}" class="payment-link">Pagar com Cartao</a>
  `;
}
```

Para faturas `prepaid_class`, o `stripe_hosted_invoice_url` e a pagina geral de pagamento do Stripe que mostra TODOS os metodos disponiveis (cartao, boleto, PIX). O rotulo "Pagar com Cartao" e enganoso — o aluno pode pensar que so aceita cartao quando na verdade aceita boleto e PIX tambem.

**Problema**: O Gap 166 (secao 6.4) corrige o botao CTA principal (`ctaButton`), mas NAO corrige a secao de metodos de pagamento (linhas 289-312). Para faturas prepaid:
- O CTA seria corrigido para "Pagar Agora" via `stripe_hosted_invoice_url` ✓
- MAS a secao de metodos AINDA mostraria "Pagar com Cartao" como label ✗

**Resolucao necessaria**: Na secao 6.4, apos o fix do CTA, adicionar logica para:
- Se `invoice.invoice_type === 'prepaid_class'`, renderizar a secao de metodos como "Pagar Fatura" (link unico para `stripe_hosted_invoice_url`) em vez de listar metodos individuais
- OU: renomear label para "Escolher Metodo de Pagamento" quando `invoice_type === 'prepaid_class'`

---

## Ponta Solta 15: Fase 0 nao inclui Gap 90 (`invoice.finalized` case explicito no webhook)

**Gravidade: BAIXA**

A Fase 0 (secao 11, linhas 1722-1737) lista as correcoes criticas a deployer ANTES de novas features:
- Gaps 82, 83, 86, 98, 99, 103-106, 114, 115

Porem, Gap 90 (`invoice.finalized`) NAO esta na lista. O Gap 90 recomenda adicionar um case explicito:

```typescript
case 'invoice.finalized':
  logStep("Invoice finalized (no action needed)", { invoiceId: eventObject.id });
  break;
```

Atualmente, `invoice.finalized` cai no `default` case (linha 539-540: `logStep("Unhandled event type", { type: event.type })`), que funciona corretamente (loga e faz break → completeEventProcessing(true)). O risco e BAIXO.

**Problema**: Quando `process-class-billing` for deployado e comecar a finalizar invoices no Stripe, os logs serao poluidos com "Unhandled event type: invoice.finalized" — criando ruido que dificulta o debugging de problemas reais. Tambem pode confundir monitores de alerta que filtram por "unhandled".

**Resolucao necessaria**: Incluir Gap 90 na Fase 0 (baixo esforco, zero risco, reduz ruido de log).

---

## Resumo de Acoes

| # | Ponta Solta | Gravidade | Acao |
|---|-------------|-----------|------|
| 10 | `payment_intent.succeeded` sem handler completo | Alta | Fornecer handler completo de substituicao OU helper function |
| 11 | SELECT de `payment_intent.succeeded` sem `stripe_invoice_id` | Alta | Atualizar SELECT para incluir campos necessarios |
| 12 | `invoice.payment_failed` sem check de `payment_origin` | Media | Adicionar verificacao `payment_origin === 'manual'` |
| 13 | `invoice.payment_succeeded` sem codigo completo | Media | Fornecer handler completo OU helper function compartilhado |
| 14 | `send-invoice-notification` label enganoso para prepaid | Media | Corrigir label da secao de metodos para prepaid |
| 15 | Fase 0 sem Gap 90 (`invoice.finalized`) | Baixa | Incluir case explicito na Fase 0 |

---

## Nota: Consolidacao Recomendada (Pontas 10 + 11 + 13)

As pontas 10, 11 e 13 podem ser resolvidas JUNTAS com a criacao de uma funcao helper:

```typescript
async function handleInvoicePaidEvent(
  supabaseClient: any,
  stripe: Stripe,
  event: Stripe.Event,
  invoice: Stripe.Invoice
): Promise<void> {
  // Logica consolidada de invoice.paid / invoice.payment_succeeded
  // Inclui: .maybeSingle(), payment_origin check, charge retrieval,
  // participant confirmation, completeEventProcessing
}
```

Ambos handlers (`invoice.paid` e `invoice.payment_succeeded`) chamariam esta funcao. Isso tambem resolveria o risco de divergencia documentado no Gap 139.

Da mesma forma, `payment_intent.succeeded` receberia seu proprio handler completo com SELECT expandido (incluindo `stripe_invoice_id`).


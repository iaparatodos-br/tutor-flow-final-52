

# Revisao v3.0 — Pontas Soltas Identificadas

Apos revisao cruzada exaustiva entre o documento `docs/hybrid-billing-implementation-plan.md` (v3.0, 168 gaps) e o codigo-fonte real do projeto, identifiquei **9 pontas soltas** que precisam ser resolvidas antes da implementacao.

---

## Ponta Solta 1: `invoice_classes` NAO tem coluna `stripe_invoice_item_id` no schema atual

**Gravidade: ALTA**

A secao 3.2 do plano define:
```sql
ALTER TABLE public.invoice_classes
  ADD COLUMN IF NOT EXISTS stripe_invoice_item_id TEXT DEFAULT NULL;
```

Porem, o schema TypeScript gerado (`src/integrations/supabase/types.ts`, linhas 775-814) NAO inclui esse campo. O tipo `invoice_classes.Row` atual tem apenas: `amount`, `cancellation_policy_id`, `charge_percentage`, `class_id`, `created_at`, `dependent_id`, `description`, `id`, `invoice_id`, `item_type`, `participant_id`.

**Impacto**: A migracao SQL e o regenerar dos tipos Supabase devem ser executados JUNTOS. Sem o campo no schema TypeScript, qualquer `.select('stripe_invoice_item_id')` ou `.insert({ stripe_invoice_item_id: ... })` no frontend/edge function causara erro de tipagem.

**Resolucao necessaria**: Adicionar nota explicita no checklist de deploy: "Apos executar migracao SQL, regenerar tipos Supabase (`npx supabase gen types`) para incluir `stripe_invoice_item_id` em `invoice_classes` e `charge_timing` em `business_profiles`."

---

## Ponta Solta 2: `Financeiro.tsx` ainda usa funcao inline `getInvoiceTypeBadge` — Gap 15/25 sem codigo de substituicao

**Gravidade: MEDIA**

O plano (Gaps 15/25) documenta que `Financeiro.tsx` (linhas 30-45) tem uma funcao inline `getInvoiceTypeBadge` que DEVE ser substituida pelo componente `InvoiceTypeBadge`. O codigo real confirma (linhas 30-44):

```typescript
const getInvoiceTypeBadge = (invoiceType: string | undefined, t: ...) => {
  switch (invoiceType) {
    case 'monthly_subscription': ...
    case 'automated': ...
    case 'manual': ...
    case 'cancellation': ...
    case 'orphan_charges': ...
  }
};
```

**Problema**: O plano identifica o gap mas NAO fornece:
1. As linhas exatas onde `getInvoiceTypeBadge()` e chamado no JSX de `Financeiro.tsx` (para substituicao)
2. O componente `InvoiceTypeBadge` atual NAO mapeia `prepaid_class`, `cancellation`, nem `orphan_charges` — apenas `monthly_subscription`, `automated`, e `manual`

**Resolucao necessaria**: A secao 4.4 deve explicitar que `InvoiceTypeBadge.tsx` precisa de TODOS os 7 tipos (`monthly_subscription`, `automated`, `manual`, `prepaid_class`, `cancellation`, `orphan_charges`, `regular`) e que `Financeiro.tsx` deve substituir todas as chamadas a `getInvoiceTypeBadge()` pela importacao do componente. A funcao inline cobre 5 tipos; o componente atual cobre apenas 3.

---

## Ponta Solta 3: `financial.json` NAO tem chaves `paymentOrigins.prepaid` nem `prepaidIndicator.*`

**Gravidade: MEDIA**

A secao 6.3 do plano define que `financial.json` deve incluir:
```json
{
  "paymentOrigins": { "prepaid": "Pre-paga" },
  "prepaidIndicator": { "tooltip": "...", "badge": "...", ... }
}
```

O arquivo `src/i18n/locales/pt/financial.json` real (verificado) NAO contém essas chaves. O namespace `paymentOrigins` existe mas com valores `manual`, `stripe`, `automatic`, `unspecified` — sem `prepaid`. O namespace `prepaidIndicator` NAO existe.

**Problema**: O plano assume que essas chaves serao criadas, mas NAO indica em qual fase da implementacao elas devem ser adicionadas. A sequencia de implementacao (secao 11) lista "Fase 2: i18n" mas a referencia exata a `prepaidIndicator` nao consta.

**Resolucao necessaria**: Listar explicitamente na Fase 2 que `financial.json` (PT e EN) deve receber `paymentOrigins.prepaid` e todo o bloco `prepaidIndicator`.

---

## Ponta Solta 4: `billing.json` NAO tem namespace `chargeTiming` — i18n sera key-fallback no frontend

**Gravidade: MEDIA**

A secao 6.1 define chaves como `chargeTiming.title`, `chargeTiming.prepaid`, `chargeTiming.billingInvocationFailed`, etc. O arquivo `src/i18n/locales/pt/billing.json` real NAO contém o namespace `chargeTiming`.

**Impacto**: Se o frontend for implementado antes do i18n, todos os toasts mostrarao keys literais como `billing:chargeTiming.prepaidInvoiceCreated` em vez do texto traduzido.

**Resolucao necessaria**: Mover a criacao dos arquivos i18n para a **Fase 1** (junto com o frontend), nao a Fase 2 como esta no plano.

---

## Ponta Solta 5: `Faturas.tsx` — `canChangePaymentMethod` nao filtra `prepaid_class` (Gap 102 sem codigo no corpo do plano)

**Gravidade: ALTA**

O Gap 102 identifica que `canChangePaymentMethod` (linha 201-203 de `Faturas.tsx`) nao exclui `invoice_type === 'prepaid_class'`. O codigo real confirma:

```typescript
const canChangePaymentMethod = (invoice: Invoice) => {
  const changeableStatuses = ['open', 'pendente', 'overdue', 'vencida', 'falha_pagamento'];
  return changeableStatuses.includes(invoice.status) && invoice.payment_method;
};
```

**Problema**: O Gap 102 consta APENAS na tabela de riscos (secao 10, linha 1665). NAO existe codigo concreto de correcao em NENHUMA secao do documento (4.x, 5.x, 7.x). O implementador poderia ignorar por ser "apenas documentacao".

**Resolucao necessaria**: Adicionar secao especifica (ex: 4.7 ou dentro de 9) com o codigo de correcao:
```typescript
const canChangePaymentMethod = (invoice: Invoice) => {
  const changeableStatuses = ['open', 'pendente', 'overdue', 'vencida', 'falha_pagamento'];
  return changeableStatuses.includes(invoice.status) 
    && invoice.payment_method
    && invoice.invoice_type !== 'prepaid_class';
};
```

---

## Ponta Solta 6: `process-cancellation` CORS headers incompletos — Gap 114 sem fix aplicado

**Gravidade: MEDIA**

O Gap 114 identifica que `process-cancellation` (linha 4-7) usa CORS headers incompletos:
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

Esta funcao E chamada pelo frontend via `supabase.functions.invoke`. Sem os headers Supabase (`x-supabase-client-platform`, etc.), requests podem falhar em alguns browsers.

**Problema**: O Gap 114 documenta a necessidade mas NAO e referenciado em NENHUMA secao do corpo do plano (5.4 nao menciona CORS). Tambem nao consta no checklist de deploy.

**Resolucao necessaria**: Adicionar ao checklist de deploy e a secao 5.4.

---

## Ponta Solta 7: `voidResult` NAO e declarado no codigo real de `process-cancellation`

**Gravidade: ALTA**

O Gap 157 documenta que `let voidResult: any = null` deve ser declarado antes do loop de void em `process-cancellation`. Porem, ao examinar o codigo real (linhas 1-500), `voidResult` NAO existe em nenhum lugar. O plano insere codigo que REFERENCIA `voidResult` (linhas 1268-1274 do plano: `voidResult = { voided: false, reason: 'already_paid', ... }`) e `prepaid_invoice_info: voidResult || null` na resposta (linhas 1290 do plano).

**Problema**: O plano diz "Inserir ANTES da secao de criacao de fatura de cancelamento (linha ~374)" mas NAO especifica onde exatamente declarar a variavel. O ponto de insercao da declaracao `let voidResult: any = null;` e critico — deve ser ANTES do bloco `let invoiceClassQuery = ...` (que o plano insere na linha ~370) E ANTES da resposta final (linha 476).

**Resolucao necessaria**: Especificar linha exata de insercao de `let voidResult: any = null;` — recomendado logo apos `let shouldCharge` (verificar onde `shouldCharge` e declarado no codigo real).

---

## Ponta Solta 8: Sequencia de implementacao (secao 11) NAO lista atualizacao do webhook EXISTENTE como Fase 0

**Gravidade: CRITICA**

O plano enfatiza repetidamente (Gaps 103-106, 115) que o webhook `webhook-stripe-connect` EXISTENTE em producao deve ser atualizado ANTES de qualquer deploy:
- `.single()` -> `.maybeSingle()` (Gaps 103, 115)
- `payment_origin: 'automatic'` incondicional -> preservar existente (Gaps 104, 105)
- `stripe_hosted_invoice_url: null` incondicional -> condicional (Gap 106)
- `completeEventProcessing` nos early returns (Gaps 82, 83)
- `invoice.marked_uncollectible` sem check de `payment_origin === 'manual'` (Gap 86)

O checklist de deploy (secao 13) menciona "Atualizar webhook-stripe-connect EXISTENTE com correcoes dos Gaps 101-106, 115 ANTES de deploy de process-class-billing". Porem, a sequencia de implementacao (secao 11) NAO tem essas correcoes como fase separada — elas estao misturadas com a Fase 3 ("Webhooks e Reconciliacao").

**Problema**: Se o implementador seguir a sequencia de fases (1, 2, 3, ...) em vez do checklist, as correcoes criticas do webhook podem ser aplicadas JUNTO com as novas features, em vez de ANTES. Isso e perigoso porque os bugs `.single()` e `payment_origin: 'automatic'` ja afetam a producao atual.

**Resolucao necessaria**: Criar **Fase 0: Correcoes Criticas no Webhook Existente** na secao 11, contendo APENAS as correcoes dos Gaps 82, 83, 86, 98, 99, 103-106, 115. Essas correcoes devem ser deployadas e testadas ANTES de qualquer nova funcionalidade.

---

## Ponta Solta 9: Fluxo de "Escolher Metodo" em `Faturas.tsx` para faturas prepaid nao esta documentado

**Gravidade: BAIXA**

Em `Faturas.tsx` (linhas 381-393), quando uma fatura NAO tem `boleto_url` nem `pix_qr_code` mas TEM `stripe_hosted_invoice_url`, o botao mostrado e "Escolher Metodo" que chama `handleChoosePaymentMethod(invoice)`.

Para faturas `prepaid_class`, este fluxo JA funciona corretamente (o botao leva ao `stripe_hosted_invoice_url` do Stripe onde o aluno escolhe o metodo). Porem, o plano NAO documenta este caminho feliz explicitamente — apenas o Gap 78 menciona ocultar o botao RefreshCw.

**Problema**: Ambiguidade para o implementador. O `handleChoosePaymentMethod` pode usar `openExternalUrl(invoice.stripe_hosted_invoice_url)` que e o comportamento desejado, ou pode chamar outra logica. Sem documentacao explicita, o implementador pode pensar que precisa criar um novo fluxo.

**Resolucao necessaria**: Adicionar nota na secao 9 (tabela de compatibilidade) confirmando que o fluxo "Escolher Metodo" de `Faturas.tsx` JA funciona para faturas prepaid via `stripe_hosted_invoice_url` — nenhuma alteracao necessaria neste caminho.

---

## Resumo de Acoes

| # | Ponta Solta | Gravidade | Acao |
|---|-------------|-----------|------|
| 1 | `stripe_invoice_item_id` ausente no schema TS | Alta | Nota no checklist: regenerar tipos apos migracao |
| 2 | `getInvoiceTypeBadge` inline vs componente | Media | Completar `InvoiceTypeBadge` com 7 tipos; explicitar substituicao |
| 3 | `financial.json` sem `prepaidIndicator` | Media | Incluir explicitamente na Fase 2 |
| 4 | `billing.json` sem `chargeTiming` | Media | Mover i18n para Fase 1 |
| 5 | `canChangePaymentMethod` sem filtro prepaid | Alta | Adicionar secao com codigo concreto |
| 6 | CORS de `process-cancellation` incompletos | Media | Adicionar ao checklist e secao 5.4 |
| 7 | `voidResult` sem declaracao no codigo real | Alta | Especificar ponto exato de insercao |
| 8 | Fase 0 (correcoes webhook) nao existe na sequencia | Critica | Criar Fase 0 separada na secao 11 |
| 9 | Fluxo "Escolher Metodo" para prepaid nao documentado | Baixa | Nota de compatibilidade na secao 9 |


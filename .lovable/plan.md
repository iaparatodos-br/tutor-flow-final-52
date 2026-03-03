

# Avaliação dos 5 Pontos do Gemini vs. Plano v3.6.1

## Resultado: 2 gaps reais. 3 pontos já cobertos ou não se aplicam.

---

### Ponto 1: `process-expired-subscriptions` — NÃO SE APLICA (já refutado 2x)

O Gemini insiste que o campo é tipo `date`. Já confirmei no código (linha 41-43):

```typescript
.from('user_subscriptions')
.select('id, user_id, plan_id, stripe_subscription_id, current_period_end')
.lt('current_period_end', now.toISOString())
```

`current_period_end` é `timestamp with time zone` (timestamptz), definido pelo Stripe como instante absoluto. A comparação `.lt(timestamptz, timestamptz)` é imune a timezone. Não existe campo `ends_at` nesta tabela/função.

**Veredicto**: Nenhuma ação necessária. Terceira vez que este ponto é levantado e refutado.

---

### Ponto 2: `CreateInvoiceModal.tsx` — GAP REAL (falta na tabela de migração)

Confirmei que `CreateInvoiceModal.tsx` **não aparece** na tabela de migração do Passo 8 (39 componentes). O componente usa:

- `format(date, 'yyyy-MM-dd')` e `parse(formData.due_date, 'yyyy-MM-dd', new Date())` do date-fns
- `format(parse(...), "dd 'de' MMMM, yyyy", { locale: ptBR })` para exibição

O risco real é baixo (o `format` extrai dia/mês/ano do Date local que o utilizador selecionou), mas o componente **infringe a regra arquitetural** do Passo 8 que proíbe uso direto do `date-fns` sem wrappers. Além disso, a linha 199 de `create-invoice/index.ts` calcula o default `dueDate` com:

```typescript
new Date(Date.now() + paymentDueDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
```

Isto grava a data UTC, que pode ser 1 dia antes para utilizadores em fusos positivos (ex: Ásia/Austrália). Deve usar o timezone do professor.

**Ação**: 
1. Adicionar `CreateInvoiceModal.tsx` à tabela de migração do Passo 8 (componente 40).
2. Adicionar nota sobre `create-invoice/index.ts` linha 199 ao Passo 5.1 (default `dueDate` deve usar timezone do professor).

---

### Ponto 3: `StudentScheduleRequest.tsx` — JÁ COBERTO

O componente **já está** na tabela de migração (linha 776, 881) e tem tratamento especial no Passo 5.4 (conversão de `working_hours` do fuso do professor para o fuso do aluno). O submit (linha 272) envia `selectedTimeSlot` que é um ISO string gerado via `toISOString()` — o valor é um instante UTC absoluto derivado do slot já convertido. O plano já cobre a migração completa deste componente.

**Veredicto**: Nenhuma ação necessária.

---

### Ponto 4: Stripe API `due_date` Unix — NÃO SE APLICA

Confirmei no `create-invoice/index.ts`: a função **não** envia `due_date` para a API do Stripe como Unix timestamp. Ela grava `due_date` como string `YYYY-MM-DD` na tabela `invoices` do Supabase (linha 214). A geração do boleto/PaymentIntent acontece em `generate-boleto-for-invoice` ou `create-payment-intent-connect`, que são funções separadas. O cenário descrito pelo Gemini não corresponde ao código real.

Porém, o cálculo default do `dueDate` (linha 199) **tem** o bug UTC mencionado no Ponto 2 acima.

**Veredicto**: O bug real já foi capturado no Ponto 2.

---

### Ponto 5: CSV Import — NÃO SE APLICA

Confirmei no `StudentImportDialog.tsx`: o import **não** processa datas. Os campos importados são: `name`, `email`, `phone`, `guardian_*`, `cpf`, `billing_day`, `tipo_cadastro`, `dependentes`. Não há `birth_date` nem qualquer campo de data no mapeamento (linhas 20-37).

**Veredicto**: Nenhuma ação necessária. O cenário é hipotético.

---

## Resumo de Alterações ao Plano v3.6.1

| Alteração | Tipo | Secção |
|---|---|---|
| Adicionar `CreateInvoiceModal.tsx` à tabela do Passo 8 (componente 40) | Correção de gap | Tabela de migração |
| Adicionar nota sobre `create-invoice/index.ts` linha 199 (default `dueDate` usa UTC) | Nota técnica | Passo 5.1 |
| Atualizar contagem: 39 → **40 componentes** | Metadado | Passos 7 e 8 |


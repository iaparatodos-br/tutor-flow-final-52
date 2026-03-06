

# Fix: Boleto checkout nao atualiza plano ao voltar ao app

## Diagnostico

O problema esta em `check-subscription-status/index.ts`. Quando o professor paga via boleto:

1. O Stripe cria a subscription com status `incomplete` (aguardando compensacao)
2. O webhook `webhook-stripe-subscriptions` pode nao disparar (logs vazios confirmam)
3. O `check-subscription-status` e o fallback — mas ele so busca subscriptions `active` no Stripe (linha 729-733)
4. Subscription `incomplete` (boleto) e ignorada → usuario ve plano gratuito

Alem disso, a query no banco (linha 140-148) filtra apenas `['active', 'expired']`, ignorando registros com status `pending_boleto` ou `cancelled`.

## Correcoes

### 1. `check-subscription-status/index.ts` — Query do banco (linha 147)

Adicionar `pending_boleto` e `cancelled` ao filtro de status:
```typescript
.in('status', ['active', 'expired', 'pending_boleto', 'cancelled'])
```

### 2. `check-subscription-status/index.ts` — Busca no Stripe sem subscription no DB (linhas 728-753)

Apos checar subscriptions `active`, tambem checar `incomplete`:

```typescript
// Check for incomplete subscriptions (boleto pending)
if (!hasActiveSub) {
  const incompleteSubscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "incomplete",
    limit: 1,
  });
  
  if (incompleteSubscriptions.data.length > 0) {
    // Detect if boleto, create pending_boleto record, return pendingBoleto data
  }
}
```

### 3. `check-subscription-status/index.ts` — Busca no Stripe com subscription cancelada no DB (linhas 355-360)

Mesmo fix: apos checar `active`, tambem checar `incomplete` subscriptions no Stripe e tratar como `pending_boleto` se for boleto.

### Resumo das mudancas

- **1 arquivo**: `supabase/functions/check-subscription-status/index.ts`
- **3 pontos de correcao**: query DB, fallback Stripe sem DB, fallback Stripe com DB cancelada
- Nenhuma mudanca de schema ou frontend necessaria — o `SubscriptionContext` ja trata `pendingBoleto` corretamente


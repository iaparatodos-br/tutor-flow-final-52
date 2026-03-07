

# Fix: auto-verify-pending-invoices ignora modelo de cobrança (platform vs connected)

## Causa Raiz

Em `create-payment-intent-connect/index.ts`:
- **Boleto** (linha 613): PI criado na **plataforma** — sem `stripeAccount`
- **PIX** (linha 521): PI criado na **conta conectada** — com `{ stripeAccount }`

Em `auto-verify-pending-invoices/index.ts` (linha 100-104):
- **Sempre** passa `stripeAccount` se existir `stripe_connect_id` no business_profile
- Resultado: boletos retornam "No such payment_intent" porque o PI vive na plataforma

## Correção

### `supabase/functions/auto-verify-pending-invoices/index.ts`

1. **Condicionar o `stripeAccount` pelo `payment_method` da fatura** (linhas 94-104):

```typescript
// PIX = direct charge (PI lives on connected account) → pass stripeAccount
// Boleto/Card = destination charge (PI lives on platform) → DON'T pass stripeAccount
const useStripeAccount = stripeAccount && invoice.payment_method === 'pix';

const paymentIntent = await stripe.paymentIntents.retrieve(
  invoice.stripe_payment_intent_id,
  undefined,
  useStripeAccount ? { stripeAccount } : undefined
);
```

2. **Mesma lógica para o cancel de PI anterior** no `create-payment-intent-connect` (linha 415) — já está correto (não passa `stripeAccount`), mas vale documentar.

## Impacto

- **1 arquivo**: `supabase/functions/auto-verify-pending-invoices/index.ts`
- **1 linha de lógica**: adicionar condição `payment_method === 'pix'` antes de passar `stripeAccount`
- Após deploy, a fatura do Erik (`27ea3924`) será verificada corretamente no próximo ciclo do cron (a cada 3h) ou pode ser verificada manualmente invocando a função


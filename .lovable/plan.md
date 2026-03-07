

# Diagnostico: auto-verify funciona mas nao atualiza nenhuma fatura

## Situacao Atual

- A funcao `auto-verify-pending-invoices` roda com sucesso (status 200)
- 50 faturas verificadas, **0 atualizadas** — nenhum erro "No such payment_intent" (fix funcionou)
- A fatura do Erik (`27ea3924`) ficou de fora pelo `LIMIT 50` (73 faturas pendentes no total)
- A funcao NAO loga o status que o Stripe retorna para cada PI, impossibilitando diagnostico

## Correcoes Necessarias

### 1. Adicionar log do status retornado pelo Stripe

Em `auto-verify-pending-invoices/index.ts`, apos o `stripe.paymentIntents.retrieve`, adicionar:

```typescript
logStep("Payment intent status from Stripe", {
  invoiceId: invoice.id,
  stripeStatus: paymentIntent.status,
  paymentMethod: invoice.payment_method
});
```

### 2. Aumentar o LIMIT ou ordenar por data desc

Mudar o LIMIT de 50 para 100, ou ordenar por `created_at DESC` para priorizar faturas mais recentes (como a do Erik).

### 3. Tratar status `processing` do Stripe para boletos

Para boletos, o Stripe pode retornar `processing` apos o pagamento ser feito mas antes da compensacao bancaria ser confirmada. A funcao atualmente so trata `succeeded`, `canceled` e `payment_failed`. Se o boleto do Erik estiver em `processing`, ele esta sendo ignorado corretamente — mas precisamos do log para confirmar.

## Resumo

- **1 arquivo**: `supabase/functions/auto-verify-pending-invoices/index.ts`
- **3 mudancas**: adicionar log do status Stripe, aumentar limit, ordenar por data recente
- Apos deploy, invocar novamente para ver o status real que o Stripe retorna para o PI do Erik


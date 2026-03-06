

# Fix: process-payment-failure-downgrade falha com "No active subscription found"

## Problema

Os logs mostram claramente:

```
[PAYMENT-FAILURE-DOWNGRADE] No active subscription found
```

A edge function `process-payment-failure-downgrade` filtra por `.eq('status', 'active')` (linha 54), mas a subscription do usuario ja esta com status `expired` (confirmado nos logs do `check-subscription-status`). Resultado: a query retorna `null` e a funcao lanca erro 500.

## Correcao

**Arquivo:** `supabase/functions/process-payment-failure-downgrade/index.ts`

Alterar a query de subscriptions para aceitar tambem status `expired` e `past_due`, ja que o cenario de falha de pagamento implica que a subscription nao esta mais `active`:

Linha 54: trocar `.eq('status', 'active')` por `.in('status', ['active', 'expired', 'past_due', 'cancelled'])` e remover `.maybeSingle()` em favor de `.order('updated_at', { ascending: false }).limit(1).maybeSingle()` para pegar a mais recente.

Isso resolve o erro sem alterar a logica subsequente, pois o restante da funcao ja trata o downgrade para o plano free independente do status anterior.


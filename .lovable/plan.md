

# Diagnóstico: Fatura Paga no Stripe mas Pendente no Sistema

## Status: Passo 1 ✅ | Passo 2 ✅ | Passo 3 ⚠️ Requer ação do usuário

## Passo 1 ✅ — Fatura do Erik corrigida

- Fatura `c9366cc3`: `pendente` → `paga` ✅
- Participante `71728d68`: `aguardando_pagamento` → `confirmada` ✅
- Aula `f2f44711`: trigger automático atualizou para `confirmada` ✅

## Passo 2 ✅ — auto-verify-pending-invoices redeployada com logs de debug

O redeploy confirmou que o código com `stripeAccount` **está funcionando corretamente**:
- Lookup do business_profile: ✅ resolve `acct_1SlVXzLmXH1N0Xdo`
- Passagem do `stripeAccount` ao `retrieve`: ✅ confirmada nos logs

### Descoberta crítica: o erro NÃO é de código

O erro "No such payment_intent" persiste **mesmo** com o `stripeAccount` correto. Isso descarta bug de código. As causas possíveis são:

1. **`STRIPE_SECRET_KEY` incompatível**: a chave secreta no Supabase pode pertencer a uma conta/ambiente Stripe diferente (ex: test vs live, ou outra conta) da que foi usada para criar os PIs via `create-payment-intent-connect`
2. **Conta Connect desconectada/recriada**: o `acct_1SlVXzLmXH1N0Xdo` pode ter sido desconectado da plataforma
3. **Chave rotacionada**: se a STRIPE_SECRET_KEY foi trocada após a criação dos PIs

## Passo 3 ⚠️ — Ações necessárias no Dashboard do Stripe

### 3.1: Verificar a STRIPE_SECRET_KEY
- Ir em https://dashboard.stripe.com/apikeys
- Confirmar que a chave `sk_live_...` ou `sk_test_...` é a mesma configurada no Supabase Edge Functions Secrets
- Se houver divergência, atualizar o secret no Supabase

### 3.2: Verificar se a conta Connect está ativa
- Ir em https://dashboard.stripe.com/connect/accounts
- Verificar se `acct_1SlVXzLmXH1N0Xdo` está ativo e conectado

### 3.3: Configurar webhook para Connected accounts
- URL: `https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/webhook-stripe-connect`
- Marcar "Listen to events on Connected accounts"
- Eventos: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.succeeded`
- Secret deve corresponder ao `STRIPE_WEBHOOK_SECRET_CONNECT`

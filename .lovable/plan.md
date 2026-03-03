

# Diagnóstico: Fatura Paga no Stripe mas Pendente no Sistema

## Evidências Coletadas

1. **Fatura**: `c9366cc3` — status `pendente`, PI `pi_3T6AyBLTWEqZbfWr0FDiCDzM`, método `boleto`, criada via Connected Account `acct_1SlVXzLmXH1N0Xdo`
2. **Aula vinculada**: `f2f44711` — status `aguardando_pagamento`
3. **Webhook**: **Zero logs** para `webhook-stripe-connect` — o evento `payment_intent.succeeded` nunca chegou ao sistema
4. **Auto-verify cron** (a cada 3h): Executou mas **TODAS 50 faturas falharam** com `"No such payment_intent"` — está buscando os PIs na conta plataforma em vez da conta conectada

## Bug 1: Webhook Stripe Connect não está recebendo eventos

O webhook nunca disparou. Possíveis causas (no painel do Stripe):
- O endpoint webhook pode não estar configurado para "Listen to events on Connected accounts"
- O endpoint URL pode estar incorreto
- O webhook secret `STRIPE_WEBHOOK_SECRET_CONNECT` pode não corresponder

**Isso é uma configuração externa no Dashboard do Stripe**, não é um bug de código.

## Bug 2: `auto-verify-pending-invoices` — fallback quebrado

Apesar de o código-fonte ter a lógica de `stripeAccount` (linhas 79-97), **todas as 50 faturas falharam** com "No such payment_intent". Isso indica que a função deployada pode estar desatualizada (antes do fix #553) ou há um bug sutil na passagem do parâmetro.

O resultado é que o sistema de segurança (auto-verify a cada 3h) está completamente inoperante para faturas Connect.

## Plano de Correção

### Passo 1: Corrigir imediatamente a fatura do Erik (dados manuais)

Atualizar diretamente no banco:
- Fatura `c9366cc3`: status → `paga`, payment_origin → `automatic`
- Aula `f2f44711` + participante: status → `confirmada`

### Passo 2: Redeployar `auto-verify-pending-invoices`

Forçar redeploy para garantir que o código com `stripeAccount` esteja ativo. Após deploy, invocar manualmente para confirmar que as faturas Connect são verificadas com sucesso.

### Passo 3: Orientar sobre configuração do Webhook no Stripe

O webhook `webhook-stripe-connect` precisa estar configurado no Stripe Dashboard com:
- URL: `https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/webhook-stripe-connect`
- "Listen to events on Connected accounts" ativado
- Eventos: `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.paid`, etc.
- Secret correspondente ao `STRIPE_WEBHOOK_SECRET_CONNECT`

### Passo 4 (se necessário): Adicionar logs de debug ao auto-verify

Adicionar log explícito do `stripeAccount` resolvido antes do `retrieve` para confirmar se o lookup está funcionando.


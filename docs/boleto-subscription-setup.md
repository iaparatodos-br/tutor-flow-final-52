# Setup do Sistema de Pagamento via Boleto para Assinaturas

Este documento descreve a configuração necessária para o sistema de pagamento via Boleto Bancário nas assinaturas do Tutor Flow.

## Visão Geral

O sistema permite que usuários paguem suas assinaturas via Boleto Bancário, com as seguintes características:

1. **Status `pending_boleto`**: Novo status para assinaturas aguardando compensação de boleto
2. **Acesso Imediato**: Usuário tem acesso às funcionalidades enquanto aguarda compensação
3. **Notificações Automáticas**: Emails de confirmação, lembrete e expiração
4. **Monitoramento via Cron Job**: Verificação diária do status dos boletos

## Fluxo do Usuário

```
1. Usuário escolhe plano e seleciona Boleto no checkout
   ↓
2. Stripe gera boleto com vencimento (geralmente 3-7 dias)
   ↓
3. Assinatura criada com status "pending_boleto"
   ↓
4. Email enviado com boleto e instruções
   ↓
5. Usuário acessa sistema normalmente (modal informativo)
   ↓
6. [Cron diário] Verifica status no Stripe
   ↓
7a. Boleto pago → Status = "active", email de confirmação
7b. Boleto vence amanhã → Email de lembrete
7c. Boleto venceu → Status = "expired", email de expiração
```

## Configuração do Cron Job

### Pré-requisitos

1. Extensões `pg_cron` e `pg_net` habilitadas no Supabase
2. Service Role Key configurada

### SQL para Criar o Cron Job

Execute o seguinte SQL no **Supabase SQL Editor**:

```sql
-- Habilitar extensões (se não estiverem habilitadas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Criar cron job para verificar boletos pendentes diariamente às 8h
SELECT cron.schedule(
  'check-pending-boletos-daily',
  '0 8 * * *', -- Executa às 8:00 AM UTC todos os dias
  $$
  SELECT net.http_post(
    url := 'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/check-pending-boletos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Verificar Cron Jobs Ativos

```sql
SELECT * FROM cron.job;
```

### Remover Cron Job (se necessário)

```sql
SELECT cron.unschedule('check-pending-boletos-daily');
```

## Estrutura do Banco de Dados

### Colunas Adicionadas em `user_subscriptions`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `pending_payment_method` | TEXT | Método de pagamento pendente (ex: 'boleto') |
| `boleto_due_date` | TIMESTAMP | Data de vencimento do boleto |
| `boleto_url` | TEXT | URL para download do boleto PDF |
| `boleto_barcode` | TEXT | Código de barras do boleto |

### Status da Assinatura

| Status | Descrição |
|--------|-----------|
| `active` | Assinatura ativa e paga |
| `pending_boleto` | Aguardando compensação de boleto |
| `past_due` | Pagamento atrasado |
| `expired` | Assinatura expirada |
| `canceled` | Assinatura cancelada |

## Edge Functions

### `send-boleto-subscription-notification`

Envia emails relacionados ao boleto:

- `boleto_generated`: Quando boleto é criado
- `boleto_reminder`: Lembrete 1 dia antes do vencimento
- `boleto_paid`: Confirmação de pagamento
- `boleto_expired`: Notificação de expiração

### `check-pending-boletos`

Executa diariamente para:

1. Verificar status de cada boleto pendente no Stripe
2. Atualizar assinaturas pagas para `active`
3. Atualizar assinaturas expiradas para `expired`
4. Enviar lembretes para boletos vencendo amanhã

## Frontend

### `PendingBoletoModal`

Modal informativo (não bloqueante) que mostra:

- Status do boleto
- Data de vencimento
- Código de barras (copiável)
- Link para download do boleto
- Botão para verificar status
- Aviso de tempo de compensação
- Confirmação de acesso liberado

### `SubscriptionContext`

Novos estados:

- `pendingBoletoDetected`: Boolean indicando boleto pendente
- `pendingBoletoData`: Dados do boleto (URL, vencimento, código)

## Testes

### Cenários de Teste

1. **Checkout com Boleto**
   - Selecionar plano
   - Escolher Boleto no checkout
   - Verificar email recebido
   - Verificar acesso às funcionalidades

2. **Compensação de Boleto**
   - Simular pagamento no Stripe Dashboard
   - Executar cron job manualmente
   - Verificar atualização de status
   - Verificar email de confirmação

3. **Expiração de Boleto**
   - Criar boleto com vencimento passado
   - Executar cron job
   - Verificar downgrade para plano gratuito
   - Verificar email de expiração

### Teste Manual do Cron

```bash
curl -X POST 'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/check-pending-boletos' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

## Monitoramento

### Logs

Verificar logs das edge functions no Supabase Dashboard:

- `send-boleto-subscription-notification`
- `check-pending-boletos`
- `webhook-stripe-subscriptions`

### Métricas a Monitorar

- Quantidade de boletos pendentes
- Taxa de conversão (boleto gerado → pago)
- Tempo médio de compensação
- Taxa de expiração

## Troubleshooting

### Boleto não atualiza para ativo

1. Verificar webhook do Stripe está configurado
2. Verificar logs da função `webhook-stripe-subscriptions`
3. Executar `check-pending-boletos` manualmente

### Email não enviado

1. Verificar configuração do AWS SES
2. Verificar logs da função `send-boleto-subscription-notification`
3. Verificar se email está verificado no SES (modo sandbox)

### Cron job não executa

1. Verificar se extensões `pg_cron` e `pg_net` estão habilitadas
2. Verificar se o job está na tabela `cron.job`
3. Verificar logs no Supabase Dashboard

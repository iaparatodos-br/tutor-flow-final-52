# 📅 Configuração de Cron Jobs do Sistema de Notificações

Este documento contém instruções para configurar os cron jobs necessários para o funcionamento completo do sistema de notificações do Tutor Flow.

## 🔧 Cron Jobs Obrigatórios

### 1. Lembretes Automáticos de Aula (send-class-reminders)

**Função:** Envia lembretes automáticos para alunos 24h antes de aulas confirmadas.

**Frequência:** A cada hora (recomendado) ou diariamente às 12:00 UTC

#### SQL para Configuração:

```sql
-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover job existente (se houver)
SELECT cron.unschedule('send-class-reminders-daily');

-- Criar novo job (executa a cada hora)
SELECT cron.schedule(
  'send-class-reminders-hourly',
  '0 * * * *', -- A cada hora no minuto 0
  $$
  SELECT net.http_post(
    url := 'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/send-class-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

#### Alternativa - Execução Diária:

```sql
-- Criar job que roda diariamente às 12:00 UTC (09:00 BRT)
SELECT cron.schedule(
  'send-class-reminders-daily',
  '0 12 * * *', -- Diariamente às 12:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/send-class-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

---

### 2. Verificação de Faturas Atrasadas (check-overdue-invoices)

**Função:** Verifica faturas pendentes e envia alertas de vencimento e atraso.

**Frequência:** Diariamente às 10:00 UTC (07:00 BRT)

#### SQL para Configuração:

```sql
-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover job existente (se houver)
SELECT cron.unschedule('check-overdue-invoices-daily');

-- Criar novo job
SELECT cron.schedule(
  'check-overdue-invoices-daily',
  '0 10 * * *', -- Diariamente às 10:00 UTC (07:00 BRT)
  $$
  SELECT net.http_post(
    url := 'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/check-overdue-invoices',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

---

## 🛠️ Como Executar no Supabase

### Passo 1: Acessar o SQL Editor

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard/project/nwgomximjevgczwuyqcx)
2. No menu lateral, clique em **SQL Editor**
3. Clique em **New Query**

### Passo 2: Executar os SQLs

1. Copie e cole o SQL do primeiro cron job (lembretes de aula)
2. Clique em **Run** ou pressione `Ctrl+Enter`
3. Aguarde a mensagem de sucesso
4. Repita o processo para o segundo cron job (verificação de faturas)

### Passo 3: Verificar Jobs Ativos

Para verificar se os jobs foram criados corretamente:

```sql
SELECT 
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobname
FROM cron.job
WHERE jobname IN ('send-class-reminders-hourly', 'send-class-reminders-daily', 'check-overdue-invoices-daily');
```

---

## 📊 Monitoramento de Execução

### Verificar Últimas Execuções:

```sql
SELECT 
  j.jobname,
  r.runid,
  r.job_pid,
  r.database,
  r.username,
  r.command,
  r.status,
  r.return_message,
  r.start_time,
  r.end_time
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.jobname IN ('send-class-reminders-hourly', 'send-class-reminders-daily', 'check-overdue-invoices-daily')
ORDER BY r.start_time DESC
LIMIT 10;
```

### Verificar Logs das Edge Functions:

1. Acesse [Edge Function Logs - send-class-reminders](https://supabase.com/dashboard/project/nwgomximjevgczwuyqcx/functions/send-class-reminders/logs)
2. Acesse [Edge Function Logs - check-overdue-invoices](https://supabase.com/dashboard/project/nwgomximjevgczwuyqcx/functions/check-overdue-invoices/logs)

---

## 🔧 Troubleshooting

### Job não está rodando?

1. Verifique se as extensões estão habilitadas:
```sql
SELECT * FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');
```

2. Verifique se o job está ativo:
```sql
SELECT * FROM cron.job WHERE jobname IN ('send-class-reminders-hourly', 'check-overdue-invoices-daily');
```

3. Verifique erros na última execução:
```sql
SELECT * FROM cron.job_run_details 
WHERE status = 'failed' 
ORDER BY start_time DESC 
LIMIT 5;
```

### Recriar um Job:

```sql
-- Remover job existente
SELECT cron.unschedule('NOME_DO_JOB');

-- Recriar usando o SQL apropriado acima
```

---

## 📝 Notas Importantes

- **Fuso Horário:** Os cron jobs usam UTC. Ajuste os horários conforme necessário para seu fuso horário.
- **Service Role Key:** Os jobs usam `current_setting('app.settings.service_role_key')` que deve estar configurado no Supabase.
- **Testes:** Após configurar, aguarde a próxima execução agendada ou use as edge functions diretamente via API para testar.
- **Limites:** O Supabase tem limites para cron jobs dependendo do plano. Consulte a [documentação oficial](https://supabase.com/docs/guides/database/extensions/pg_cron).

---

## 🔗 Links Úteis

- [Documentação pg_cron](https://github.com/citusdata/pg_cron)
- [Supabase Cron Jobs Guide](https://supabase.com/docs/guides/database/extensions/pg_cron)
- [Dashboard do Projeto](https://supabase.com/dashboard/project/nwgomximjevgczwuyqcx)
- [Edge Functions](https://supabase.com/dashboard/project/nwgomximjevgczwuyqcx/functions)

# Teacher Inbox - Configuração do Cron Job

## Visão Geral

A Edge Function `generate-teacher-notifications` varre o banco de dados para identificar pendências e criar notificações na tabela `teacher_notifications`. Esta função deve ser executada periodicamente (a cada hora) para manter o inbox atualizado.

## Pré-requisitos

1. **pg_cron extension** habilitada no Supabase
2. **pg_net extension** habilitada para chamadas HTTP
3. Edge Function `generate-teacher-notifications` deployada

## SQL para Configurar o Cron Job

Execute o seguinte SQL no **Supabase SQL Editor** após o deploy da Edge Function:

```sql
-- Habilitar extensões (caso ainda não estejam habilitadas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover job anterior se existir
SELECT cron.unschedule('generate-teacher-notifications-hourly');

-- Criar novo job para executar a cada hora (minuto 0)
SELECT cron.schedule(
  'generate-teacher-notifications-hourly',
  '0 * * * *', -- A cada hora, no minuto 0
  $$
  SELECT net.http_post(
    url := 'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/generate-teacher-notifications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Z29teGltamV2Z2N6d3V5cWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTI4MDgsImV4cCI6MjA3MDUyODgwOH0.3LkSkvuOV941N6f7qKXbNSiLKFvWlAVmMpHiebWYYbY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

## Verificar Jobs Configurados

```sql
SELECT * FROM cron.job WHERE jobname LIKE '%teacher-notifications%';
```

## Verificar Histórico de Execuções

```sql
SELECT * FROM cron.job_run_details 
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname = 'generate-teacher-notifications-hourly')
ORDER BY start_time DESC
LIMIT 20;
```

## Executar Manualmente (para testes)

Você pode invocar a função manualmente via:

1. **Supabase Dashboard** → Edge Functions → generate-teacher-notifications → Invoke
2. **cURL**:
```bash
curl -X POST \
  'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/generate-teacher-notifications' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Z29teGltamV2Z2N6d3V5cWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTI4MDgsImV4cCI6MjA3MDUyODgwOH0.3LkSkvuOV941N6f7qKXbNSiLKFvWlAVmMpHiebWYYbY' \
  -H 'Content-Type: application/json'
```

## Categorias de Notificações Geradas

| Categoria | Descrição | Source Type |
|-----------|-----------|-------------|
| `pending_past_classes` | Aulas com status 'pendente' no passado (últimos 30 dias) | class |
| `amnesty_eligible` | Aulas canceladas com cobrança, elegíveis para anistia | class |
| `overdue_invoices` | Faturas vencidas (status 'overdue' ou calculado) | invoice |
| `pending_reports` | Aulas concluídas sem relatório (Professional/Premium) | class |

## Filtros Aplicados

- **Temporal**: Apenas dados dos últimos 30 dias
- **Experimental**: Exclui aulas experimentais (`is_experimental = false`)
- **Template**: Exclui templates (`is_template = false`)
- **Subscription**: Apenas professores com `subscription_status IN ('active', 'trialing')`
- **Financial**: Faturas apenas para professores com `business_profile_id` configurado
- **Reports**: Apenas para planos Professional/Premium

## Cleanup Automático

A função também remove notificações com status `done` que estão há mais de 30 dias na categoria "done", mantendo o banco limpo.

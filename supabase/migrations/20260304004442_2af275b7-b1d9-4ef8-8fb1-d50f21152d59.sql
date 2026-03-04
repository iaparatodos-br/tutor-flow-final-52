
-- Fase 7: Migrar cron job de faturamento de diário para horário (hourly sweeper)

-- 1. Remover o job diário antigo
SELECT cron.unschedule('automated-billing-daily');

-- 2. Criar o novo job horário (a cada hora no minuto 0)
SELECT cron.schedule(
  'automated-billing-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/automated-billing',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Z29teGltamV2Z2N6d3V5cWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTI4MDgsImV4cCI6MjA3MDUyODgwOH0.3LkSkvuOV941N6f7qKXbNSiLKFvWlAVmMpHiebWYYbY"}'::jsonb,
    body := '{"triggered_by": "cron"}'::jsonb
  ) AS request_id;
  $$
);

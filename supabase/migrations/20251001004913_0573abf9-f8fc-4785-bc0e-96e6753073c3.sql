-- Ativar extensão pg_cron se ainda não estiver ativa
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Tentar remover job existente (ignora erro se não existir)
DO $$
BEGIN
  PERFORM cron.unschedule('auto-verify-pending-invoices');
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Ignora erro se job não existir
END $$;

-- Criar novo cron job para verificar faturas pendentes a cada 3 horas
SELECT cron.schedule(
  'auto-verify-pending-invoices',
  '0 */3 * * *', -- A cada 3 horas (às 00:00, 03:00, 06:00, etc)
  $$
  SELECT
    net.http_post(
      url:='https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/auto-verify-pending-invoices',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Z29teGltamV2Z2N6d3V5cWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTI4MDgsImV4cCI6MjA3MDUyODgwOH0.3LkSkvuOV941N6f7qKXbNSiLKFvWlAVmMpHiebWYYbY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
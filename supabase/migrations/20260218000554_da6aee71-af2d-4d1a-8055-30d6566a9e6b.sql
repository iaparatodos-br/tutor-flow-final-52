-- Criar cron job para processar assinaturas expiradas (Daily 10:00 UTC / 7:00 AM Brasília)
SELECT cron.schedule(
  'process-expired-subscriptions-daily',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/process-expired-subscriptions',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Z29teGltamV2Z2N6d3V5cWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTI4MDgsImV4cCI6MjA3MDUyODgwOH0.3LkSkvuOV941N6f7qKXbNSiLKFvWlAVmMpHiebWYYbY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);
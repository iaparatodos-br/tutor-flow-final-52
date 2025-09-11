-- Habilita a extensão pg_cron se ainda não estiver habilitada
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Habilita a extensão pg_net se ainda não estiver habilitada  
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agenda o job para rodar às 3:00 da manhã (UTC) do primeiro dia de cada mês.
-- O 'Authorization' header contém a Service Role Key do projeto.
SELECT cron.schedule(
  'monthly-data-archiver', -- Nome do Job
  '0 3 1 * *',             -- Cron schedule: At 03:00 on day-of-month 1.
  $$
  SELECT net.http_post(
      url:='https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/archive-old-data',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      )
  ) as request_id;
  $$
);

-- Para verificar se o job foi criado com sucesso, execute:
-- SELECT * FROM cron.job WHERE jobname = 'monthly-data-archiver';
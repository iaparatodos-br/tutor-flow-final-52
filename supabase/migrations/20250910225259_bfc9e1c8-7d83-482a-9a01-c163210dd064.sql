-- Criar bucket de arquivos privado
INSERT INTO storage.buckets (id, name, public) VALUES ('archives', 'archives', false);

-- Políticas RLS para o bucket de arquivos (apenas service role)
CREATE POLICY "Permitir acesso apenas via service role"
ON storage.objects FOR SELECT
USING (bucket_id = 'archives' AND (SELECT auth.role()) = 'service_role');

CREATE POLICY "Permitir inserção apenas via service role"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'archives' AND (SELECT auth.role()) = 'service_role');

CREATE POLICY "Permitir update apenas via service role"
ON storage.objects FOR UPDATE
USING (bucket_id = 'archives' AND (SELECT auth.role()) = 'service_role');

CREATE POLICY "Permitir delete apenas via service role"
ON storage.objects FOR DELETE
USING (bucket_id = 'archives' AND (SELECT auth.role()) = 'service_role');

-- Função para agendar o job de arquivamento mensal
-- Executa às 3:00 da manhã do primeiro dia de cada mês
SELECT cron.schedule(
  'monthly-data-archiver',
  '0 3 1 * *',
  $$
  SELECT net.http_post(
      url:='https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/archive-old-data',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Z29teGltamV2Z2N6d3V5cWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTI4MDgsImV4cCI6MjA3MDUyODgwOH0.3LkSkvuOV941N6f7qKXbNSiLKFvWlAVmMpHiebWYYbY"}'::jsonb,
      body:='{"source": "cron"}'::jsonb
  );
  $$
);
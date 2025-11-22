-- ============================================
-- MIGRATION: Habilitar extensões para cron jobs
-- ============================================

-- Habilitar pg_cron para agendamento de tarefas
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Habilitar pg_net para chamadas HTTP
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Comentário explicativo
COMMENT ON EXTENSION pg_cron IS 'Extensão para agendamento de tarefas recorrentes (cron jobs)';
COMMENT ON EXTENSION pg_net IS 'Extensão para realizar chamadas HTTP assíncronas';
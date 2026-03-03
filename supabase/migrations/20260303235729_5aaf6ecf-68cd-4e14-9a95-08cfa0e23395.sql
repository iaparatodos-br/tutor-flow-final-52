-- Fase 1: Adicionar coluna timezone à tabela profiles
-- Permite suporte a múltiplos fusos horários por utilizador
ALTER TABLE public.profiles
ADD COLUMN timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

-- Comentário explicativo na coluna
COMMENT ON COLUMN public.profiles.timezone IS 'IANA timezone identifier (e.g. America/Sao_Paulo, Europe/Lisbon). Default: America/Sao_Paulo';

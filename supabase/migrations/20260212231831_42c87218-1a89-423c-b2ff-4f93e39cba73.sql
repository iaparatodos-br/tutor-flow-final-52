
-- Fase 1: Adicionar charge_timing em business_profiles e is_paid_class em classes

-- 1.1 charge_timing em business_profiles
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS charge_timing TEXT NOT NULL DEFAULT 'postpaid';

ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_charge_timing_check
  CHECK (charge_timing IN ('prepaid', 'postpaid'));

COMMENT ON COLUMN public.business_profiles.charge_timing IS
  'Define se o professor cobra antes (prepaid) ou depois (postpaid) do agendamento. Default postpaid para preservar comportamento existente.';

-- 1.2 is_paid_class em classes
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS is_paid_class BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.classes.is_paid_class IS
  'Indica se esta aula gera cobranca. false = aula gratuita (ex: reposicao, cortesia).';

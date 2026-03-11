ALTER TABLE public.class_participants 
  ADD COLUMN IF NOT EXISTS amnesty_granted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS amnesty_granted_by uuid,
  ADD COLUMN IF NOT EXISTS amnesty_granted_at timestamptz;
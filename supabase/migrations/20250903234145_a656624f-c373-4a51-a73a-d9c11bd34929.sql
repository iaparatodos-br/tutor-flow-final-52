
-- 1) Remover duplicatas em user_subscriptions, mantendo o registro mais recente por usuário
WITH ranked AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.user_subscriptions
)
DELETE FROM public.user_subscriptions us
USING ranked r
WHERE us.id = r.id
  AND r.rn > 1;

-- 2) Adicionar constraint UNIQUE para suportar upsert onConflict: 'user_id'
ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_user_id_unique UNIQUE (user_id);

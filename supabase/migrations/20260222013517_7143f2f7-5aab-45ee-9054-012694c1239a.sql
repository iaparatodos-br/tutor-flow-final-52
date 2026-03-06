-- Set subscription to expired for M35 payment failure test
UPDATE user_subscriptions 
SET status = 'expired', 
    current_period_end = '2026-02-20T16:00:00+00:00',
    updated_at = NOW()
WHERE user_id = '45f729dc-8524-40b4-a9b9-aecfe329dd8d';

UPDATE profiles 
SET current_plan_id = 'a3f942d2-b201-4428-9366-b2b7c62ae2cb',
    subscription_status = 'expired',
    subscription_end_date = '2026-02-20T16:00:00+00:00',
    updated_at = NOW()
WHERE id = '45f729dc-8524-40b4-a9b9-aecfe329dd8d';

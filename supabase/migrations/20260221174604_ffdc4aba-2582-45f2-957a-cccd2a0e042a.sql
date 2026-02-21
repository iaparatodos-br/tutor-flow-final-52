
-- Force-expire the subscription for testing M31
UPDATE user_subscriptions 
SET status = 'expired', 
    current_period_end = NOW() - INTERVAL '1 hour',
    updated_at = NOW()
WHERE id = 'd7245c98-23bb-40bc-adfa-152d4f4ec78d';

-- Update profile to free plan
UPDATE profiles 
SET current_plan_id = 'a3f942d2-b201-4428-9366-b2b7c62ae2cb',
    subscription_status = 'expired',
    subscription_end_date = NOW() - INTERVAL '1 hour',
    updated_at = NOW()
WHERE id = '45f729dc-8524-40b4-a9b9-aecfe329dd8d';

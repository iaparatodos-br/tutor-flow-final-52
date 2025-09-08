-- Fix search_path warning for teacher_has_financial_module function
CREATE OR REPLACE FUNCTION public.teacher_has_financial_module(teacher_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    has_feature boolean := false;
BEGIN
    -- Check if teacher has active subscription with financial_module feature
    SELECT COALESCE(
        (sp.features->>'financial_module')::boolean, 
        false
    ) INTO has_feature
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = teacher_id 
    AND us.status = 'active'
    AND sp.is_active = true;
    
    RETURN COALESCE(has_feature, false);
END;
$$;
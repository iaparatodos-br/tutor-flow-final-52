-- TEMPORARY: Increase free plan student limit for M35 test
UPDATE subscription_plans SET student_limit = 100 WHERE slug = 'free';

-- REVERT: Restore free plan student limit
UPDATE subscription_plans SET student_limit = 3 WHERE slug = 'free';

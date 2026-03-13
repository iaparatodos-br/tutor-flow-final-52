-- Mass delete all users except two protected accounts
-- Protected: erikroncaglio@gmail.com (f12e0f0c-a0d0-4b9a-8023-3672cc5be259)
-- Protected: guilherme.b.motta@gmail.com (51a6b44b-cd23-4b68-b345-ea9806ee5492)
-- 
-- IMPORTANT: Run this in the Supabase SQL Editor
-- This is a DESTRUCTIVE and IRREVERSIBLE operation

-- Step 1: Temporarily disable protective triggers
ALTER TABLE monthly_subscriptions DISABLE TRIGGER prevent_monthly_subscription_delete_trigger;
ALTER TABLE term_acceptances DISABLE TRIGGER prevent_term_acceptance_delete;
ALTER TABLE term_acceptances DISABLE TRIGGER prevent_term_acceptance_update;

-- Step 2: Cascade-safe deletion
DO $$
DECLARE
  pids uuid[] := ARRAY[
    'f12e0f0c-a0d0-4b9a-8023-3672cc5be259',
    '51a6b44b-cd23-4b68-b345-ea9806ee5492'
  ];
  uids uuid[];
  cids uuid[];
  mids uuid[];
  rids uuid[];
  iids uuid[];
  relids uuid[];
BEGIN
  SELECT array_agg(id) INTO uids FROM profiles WHERE id != ALL(pids);
  IF uids IS NULL THEN
    RAISE NOTICE 'No users to delete';
    RETURN;
  END IF;
  RAISE NOTICE 'Deleting % users', array_length(uids, 1);

  -- Collect dependent IDs
  SELECT array_agg(id) INTO cids FROM classes WHERE teacher_id = ANY(uids);
  SELECT array_agg(id) INTO mids FROM materials WHERE teacher_id = ANY(uids);
  SELECT array_agg(id) INTO rids FROM class_reports WHERE teacher_id = ANY(uids);
  SELECT array_agg(id) INTO iids FROM invoices WHERE teacher_id = ANY(uids) OR student_id = ANY(uids);
  SELECT array_agg(id) INTO relids FROM teacher_student_relationships WHERE teacher_id = ANY(uids) OR student_id = ANY(uids);

  -- 1. class_notifications
  IF cids IS NOT NULL THEN
    DELETE FROM class_notifications WHERE class_id = ANY(cids);
  END IF;
  DELETE FROM class_notifications WHERE student_id = ANY(uids);

  -- 2-3. class_report_feedbacks & photos
  IF rids IS NOT NULL THEN
    DELETE FROM class_report_feedbacks WHERE report_id = ANY(rids);
    DELETE FROM class_report_photos WHERE report_id = ANY(rids);
  END IF;

  -- 4. class_reports
  DELETE FROM class_reports WHERE teacher_id = ANY(uids);

  -- 5. invoice_classes
  IF iids IS NOT NULL THEN
    DELETE FROM invoice_classes WHERE invoice_id = ANY(iids);
  END IF;

  -- 6. class_participants
  IF cids IS NOT NULL THEN
    DELETE FROM class_participants WHERE class_id = ANY(cids);
  END IF;
  DELETE FROM class_participants WHERE student_id = ANY(uids);

  -- 7. material_access
  IF mids IS NOT NULL THEN
    DELETE FROM material_access WHERE material_id = ANY(mids);
  END IF;
  DELETE FROM material_access WHERE student_id = ANY(uids);

  -- 8-9. materials & categories
  DELETE FROM materials WHERE teacher_id = ANY(uids);
  DELETE FROM material_categories WHERE teacher_id = ANY(uids);

  -- 10. dependents
  DELETE FROM dependents WHERE teacher_id = ANY(uids) OR responsible_id = ANY(uids);

  -- 11. student_monthly_subscriptions
  IF relids IS NOT NULL THEN
    DELETE FROM student_monthly_subscriptions WHERE relationship_id = ANY(relids);
  END IF;

  -- 12. monthly_subscriptions
  DELETE FROM monthly_subscriptions WHERE teacher_id = ANY(uids);

  -- 13. invoices
  DELETE FROM invoices WHERE teacher_id = ANY(uids) OR student_id = ANY(uids);

  -- 14. classes
  DELETE FROM classes WHERE teacher_id = ANY(uids);

  -- 15. class_services
  DELETE FROM class_services WHERE teacher_id = ANY(uids);

  -- 16. teacher_student_relationships
  DELETE FROM teacher_student_relationships WHERE teacher_id = ANY(uids) OR student_id = ANY(uids);

  -- 17. cancellation_policies
  DELETE FROM cancellation_policies WHERE teacher_id = ANY(uids);

  -- 18. user_subscriptions
  DELETE FROM user_subscriptions WHERE user_id = ANY(uids);

  -- 19. teacher_notifications
  DELETE FROM teacher_notifications WHERE teacher_id = ANY(uids);

  -- 20. pending_business_profiles
  DELETE FROM pending_business_profiles WHERE user_id = ANY(uids);

  -- 21. business_profiles
  DELETE FROM business_profiles WHERE user_id = ANY(uids);

  -- 22. payment_accounts
  DELETE FROM payment_accounts WHERE teacher_id = ANY(uids);

  -- 23. stripe_connect_accounts
  DELETE FROM stripe_connect_accounts WHERE teacher_id = ANY(uids);

  -- 24. working_hours
  DELETE FROM working_hours WHERE teacher_id = ANY(uids);

  -- 25. availability_blocks
  DELETE FROM availability_blocks WHERE teacher_id = ANY(uids);

  -- 26. expense_categories
  DELETE FROM expense_categories WHERE teacher_id = ANY(uids);

  -- 27. expenses
  DELETE FROM expenses WHERE teacher_id = ANY(uids);

  -- 28. pending_refunds
  DELETE FROM pending_refunds WHERE teacher_id = ANY(uids) OR student_id = ANY(uids);

  -- 29. security_audit_logs
  DELETE FROM security_audit_logs WHERE user_id = ANY(uids);

  -- 30. login_attempts
  DELETE FROM login_attempts WHERE user_id = ANY(uids);

  -- 31. audit_logs
  DELETE FROM audit_logs WHERE actor_id = ANY(uids) OR target_teacher_id = ANY(uids);

  -- 32. student_overage_charges
  DELETE FROM student_overage_charges WHERE user_id = ANY(uids);

  -- 33. term_acceptances
  DELETE FROM term_acceptances WHERE user_id = ANY(uids);

  -- 34. profiles
  DELETE FROM profiles WHERE id = ANY(uids);

  -- 35. auth.users
  DELETE FROM auth.users WHERE id = ANY(uids);

  RAISE NOTICE 'Mass deletion complete.';
END $$;

-- Step 3: Re-enable protective triggers
ALTER TABLE monthly_subscriptions ENABLE TRIGGER prevent_monthly_subscription_delete_trigger;
ALTER TABLE term_acceptances ENABLE TRIGGER prevent_term_acceptance_delete;
ALTER TABLE term_acceptances ENABLE TRIGGER prevent_term_acceptance_update;

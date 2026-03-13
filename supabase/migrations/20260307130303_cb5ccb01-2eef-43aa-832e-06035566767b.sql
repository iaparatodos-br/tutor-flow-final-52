
DO $$
DECLARE
  user_ids uuid[] := ARRAY[
    '1ef8a972-5fbb-4e9d-9674-3c3537933fb9'::uuid,
    '41dda305-8bf7-4008-af9c-5fec850b297f'::uuid
  ];
  class_ids uuid[];
  material_ids uuid[];
  report_ids uuid[];
  invoice_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO class_ids FROM classes WHERE teacher_id = ANY(user_ids);
  SELECT array_agg(id) INTO material_ids FROM materials WHERE teacher_id = ANY(user_ids);
  SELECT array_agg(id) INTO report_ids FROM class_reports WHERE teacher_id = ANY(user_ids);
  SELECT array_agg(id) INTO invoice_ids FROM invoices WHERE teacher_id = ANY(user_ids) OR student_id = ANY(user_ids);

  IF class_ids IS NOT NULL THEN
    DELETE FROM class_notifications WHERE class_id = ANY(class_ids);
  END IF;
  DELETE FROM class_notifications WHERE student_id = ANY(user_ids);

  IF report_ids IS NOT NULL THEN
    DELETE FROM class_report_feedbacks WHERE report_id = ANY(report_ids);
    DELETE FROM class_report_photos WHERE report_id = ANY(report_ids);
  END IF;

  DELETE FROM class_reports WHERE teacher_id = ANY(user_ids);

  IF invoice_ids IS NOT NULL THEN
    DELETE FROM invoice_classes WHERE invoice_id = ANY(invoice_ids);
  END IF;

  DELETE FROM invoices WHERE teacher_id = ANY(user_ids) OR student_id = ANY(user_ids);

  IF class_ids IS NOT NULL THEN
    DELETE FROM class_participants WHERE class_id = ANY(class_ids);
  END IF;
  DELETE FROM class_participants WHERE student_id = ANY(user_ids);

  IF material_ids IS NOT NULL THEN
    DELETE FROM material_access WHERE material_id = ANY(material_ids);
  END IF;
  DELETE FROM material_access WHERE student_id = ANY(user_ids);

  DELETE FROM materials WHERE teacher_id = ANY(user_ids);
  DELETE FROM material_categories WHERE teacher_id = ANY(user_ids);
  DELETE FROM dependents WHERE teacher_id = ANY(user_ids) OR responsible_id = ANY(user_ids);

  DELETE FROM student_monthly_subscriptions WHERE relationship_id IN (
    SELECT id FROM teacher_student_relationships WHERE teacher_id = ANY(user_ids) OR student_id = ANY(user_ids)
  );

  DELETE FROM monthly_subscriptions WHERE teacher_id = ANY(user_ids);
  DELETE FROM classes WHERE teacher_id = ANY(user_ids);
  DELETE FROM class_services WHERE teacher_id = ANY(user_ids);
  DELETE FROM teacher_student_relationships WHERE teacher_id = ANY(user_ids) OR student_id = ANY(user_ids);
  DELETE FROM cancellation_policies WHERE teacher_id = ANY(user_ids);
  DELETE FROM user_subscriptions WHERE user_id = ANY(user_ids);
  DELETE FROM teacher_notifications WHERE teacher_id = ANY(user_ids);
  DELETE FROM pending_business_profiles WHERE user_id = ANY(user_ids);
  DELETE FROM business_profiles WHERE user_id = ANY(user_ids);
  DELETE FROM payment_accounts WHERE teacher_id = ANY(user_ids);
  DELETE FROM stripe_connect_accounts WHERE teacher_id = ANY(user_ids);
  DELETE FROM working_hours WHERE teacher_id = ANY(user_ids);
  DELETE FROM availability_blocks WHERE teacher_id = ANY(user_ids);
  DELETE FROM expense_categories WHERE teacher_id = ANY(user_ids);
  DELETE FROM expenses WHERE teacher_id = ANY(user_ids);
  DELETE FROM pending_refunds WHERE teacher_id = ANY(user_ids) OR student_id = ANY(user_ids);
  DELETE FROM security_audit_logs WHERE user_id = ANY(user_ids);
  DELETE FROM login_attempts WHERE user_id = ANY(user_ids);
  DELETE FROM audit_logs WHERE actor_id = ANY(user_ids) OR target_teacher_id = ANY(user_ids);
  DELETE FROM student_overage_charges WHERE user_id = ANY(user_ids);

  -- Temporarily disable immutability triggers on term_acceptances
  ALTER TABLE term_acceptances DISABLE TRIGGER prevent_term_acceptance_delete;
  ALTER TABLE term_acceptances DISABLE TRIGGER prevent_term_acceptance_update;
  DELETE FROM term_acceptances WHERE user_id = ANY(user_ids);
  ALTER TABLE term_acceptances ENABLE TRIGGER prevent_term_acceptance_delete;
  ALTER TABLE term_acceptances ENABLE TRIGGER prevent_term_acceptance_update;

  DELETE FROM profiles WHERE id = ANY(user_ids);
  DELETE FROM auth.users WHERE id = ANY(user_ids);
END $$;

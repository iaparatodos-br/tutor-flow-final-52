

# Delete All Users Except Two Protected Accounts

## Scope

Delete **186 users** (30 professors + 156 students) and all their related data from every table. Keep only:
- `f12e0f0c-a0d0-4b9a-8023-3672cc5be259` — erikroncaglio@gmail.com
- `51a6b44b-cd23-4b68-b345-ea9806ee5492` — guilherme.b.motta@gmail.com

## Approach

Create a SQL migration that:

1. Collects all user IDs to delete into a temp variable (all profiles WHERE id NOT IN the two protected IDs)
2. Collects dependent IDs (class_ids, material_ids, report_ids, invoice_ids) scoped to those users
3. Deletes in cascade-safe order across all tables:

**Deletion order (same pattern as previous cleanup):**
1. `class_notifications` (by class_id + student_id)
2. `class_report_feedbacks` (by report_id)
3. `class_report_photos` (by report_id)
4. `class_reports` (by teacher_id)
5. `invoice_classes` (by invoice_id)
6. `class_participants` (by class_id + student_id)
7. `material_access` (by material_id + student_id)
8. `materials` (by teacher_id)
9. `material_categories` (by teacher_id)
10. `dependents` (by teacher_id + responsible_id)
11. `student_monthly_subscriptions` (by relationship_id)
12. `monthly_subscriptions` (by teacher_id)
13. `invoices` (by teacher_id + student_id)
14. `classes` (by teacher_id)
15. `class_services` (by teacher_id)
16. `teacher_student_relationships` (by teacher_id + student_id)
17. `cancellation_policies` (by teacher_id)
18. `user_subscriptions` (by user_id)
19. `teacher_notifications` (by teacher_id)
20. `pending_business_profiles` (by user_id)
21. `business_profiles` (by user_id)
22. `payment_accounts` (by teacher_id)
23. `stripe_connect_accounts` (by teacher_id)
24. `working_hours` (by teacher_id)
25. `availability_blocks` (by teacher_id)
26. `expense_categories` (by teacher_id)
27. `expenses` (by teacher_id)
28. `pending_refunds` (by teacher_id + student_id)
29. `security_audit_logs` (by user_id)
30. `login_attempts` (by user_id)
31. `audit_logs` (by actor_id + target_teacher_id)
32. `student_overage_charges` (by user_id)
33. `term_acceptances` (disable triggers, delete, re-enable)
34. `profiles` (by id)
35. `auth.users` (by id)

## Technical Details

- Uses a DO block with `user_ids uuid[]` built dynamically from `SELECT array_agg(id) FROM profiles WHERE id NOT IN (protected_ids)`
- Temporarily disables immutability triggers on `term_acceptances`
- Single migration file, no code changes needed
- This is a destructive, irreversible operation


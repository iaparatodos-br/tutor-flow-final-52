

# Delete All Data for Two Users

**Users to delete:**
- `1ef8a972-5fbb-4e9d-9674-3c3537933fb9` — teacherella.strawa@gmail.com (Ella, professor)
- `41dda305-8bf7-4008-af9c-5fec850b297f` — ellaesp@hotmail.co.uk (Ella, professor)

## Data Summary

| Table | Records |
|-------|---------|
| class_notifications | 9 |
| class_participants | 4 |
| class_report_feedbacks | 0 |
| class_report_photos | 0 |
| class_reports | 1 |
| material_access | 3 |
| materials | 3 |
| material_categories | 2 |
| classes | 4 |
| class_services | 2 |
| teacher_student_relationships | 2 |
| user_subscriptions | 2 |
| cancellation_policies | 1 |
| audit_logs | 2 |
| profiles | 2 |
| **auth.users** | 2 |

## Deletion Order (cascade-safe)

Using the insert tool, execute deletions in this order to respect foreign key constraints:

1. `class_notifications` (by class_id)
2. `class_report_feedbacks` (by report_id) — 0 rows
3. `class_report_photos` (by report_id) — 0 rows
4. `class_reports` (by teacher_id)
5. `invoice_classes` (by invoice_id) — 0 rows
6. `class_participants` (by class_id)
7. `material_access` (by material_id)
8. `materials` (by teacher_id)
9. `material_categories` (by teacher_id)
10. `classes` (by teacher_id)
11. `class_services` (by teacher_id)
12. `teacher_student_relationships` (by teacher_id)
13. `cancellation_policies` (by teacher_id)
14. `user_subscriptions` (by user_id)
15. `audit_logs` (by actor_id/target_teacher_id)
16. `profiles` (by id)
17. `auth.users` (by id) — via Supabase `auth.admin.deleteUser()` or SQL

**Note:** The auth.users deletion will be done via `DELETE FROM auth.users WHERE id IN (...)` which should cascade to profiles if there's a trigger, or we delete profiles first then auth.users.

## Technical Details

All deletions use the two user IDs and the 4 class IDs as filters. No code changes needed — this is purely a database data cleanup operation.


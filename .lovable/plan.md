

## Bug: Responsible cancellation only cancels one participant in "group" classes with dependents

### Root Cause

In `supabase/functions/process-cancellation/index.ts`, when a student cancels a group class (line 280-341), the code only updates ONE participant:

- If `dependent_id` is provided: only the dependent's participant row is cancelled
- If not: only the student's own participant row is cancelled

For classes where a responsible + their dependent are both participants (marked `is_group_class = true`), this means only one of the two participants gets cancelled. The trigger `sync_class_status_from_participants` sees that not all participants are cancelled and keeps the class as 'confirmada'.

Additionally, in `src/pages/Agenda.tsx` (lines 1782-1797), the `dependentInfo` is auto-detected by finding the first participant with a `dependent_id`. This means the cancellation modal always sends a `dependent_id`, which causes the edge function to only cancel the dependent's participation.

### Fix

**`supabase/functions/process-cancellation/index.ts`** (lines 287-306):

When a student leaves a group class, cancel ALL their participations (self + dependents) instead of just one. Replace the conditional `dependent_id` / `student_id` filter with a single `student_id = safeCancelledBy` filter:

```text
// Before:
if (dependent_id) {
  updateQuery = updateQuery.eq('dependent_id', dependent_id);
} else {
  updateQuery = updateQuery.eq('student_id', safeCancelledBy);
}

// After:
// Cancel ALL participations for this student/responsible (self + dependents)
updateQuery = updateQuery.eq('student_id', safeCancelledBy);
```

This way, when a responsible cancels a group class, all their participant rows (their own + all dependents) are cancelled in one operation. The trigger will then correctly set the class to 'cancelada' if no other students remain active.

### Impact

- Classes with responsible + dependent where the responsible cancels will now correctly show 'cancelada'
- True multi-student group classes (different `student_id` values) still work correctly: only the cancelling student's participants are removed, other students remain
- No frontend changes needed since the edge function handles it server-side


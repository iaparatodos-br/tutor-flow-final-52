

# Fix: Feedback Loading Ignores `dependent_id`

## Root Cause

In `loadExistingReport()` (line 126-143), two problems:

1. **Line 128**: The query only selects `student_id, feedback` — missing `dependent_id`
2. **Line 143**: The `find()` matches only on `student_id`, so both dependents get the first match's feedback

## Changes — `src/components/ClassReportModal.tsx`

1. **Line 128** — Add `dependent_id` to the select:
   ```ts
   .select('student_id, dependent_id, feedback')
   ```

2. **Line 143** — Match on composite key:
   ```ts
   const existingFeedback = feedbackData.find(f => 
     f.student_id === p.student_id && 
     (f.dependent_id || null) === ((p as any).dependent_id || null)
   );
   ```

Single file, two-line fix. No backend changes needed.


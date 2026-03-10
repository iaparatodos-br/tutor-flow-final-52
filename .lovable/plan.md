

## Plan: Sort available students alphabetically in MonthlySubscriptionsManager

**File**: `src/components/MonthlySubscriptionsManager.tsx`

**Change**: On line 334, sort the `availableStudents` array alphabetically by `student_name` before passing it to the component:

```tsx
availableStudents={[...(availableStudents || [])].filter(s => !s.has_active_subscription).sort((a, b) => a.student_name.localeCompare(b.student_name, 'pt-BR', { sensitivity: 'base' }))}
```

This applies the sort at the data level in `MonthlySubscriptionsManager.tsx` before the list reaches the assignment modal, as requested.


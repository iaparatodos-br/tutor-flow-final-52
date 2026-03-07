

# Fix: Duplicate Feedback Fields in Group Class Reports

## Root Cause

When two dependents share the same `responsible_id` (which is used as `student_id`), three places use only `student_id` for matching/keying:

1. **`updateFeedback(studentId, feedback)`** — matches ALL feedbacks with that `student_id`, updating both at once
2. **`feedbacks.find(f => f.student_id === participant.student_id)`** — always returns the first match, so both textareas read the same value
3. **`<div key={participant.student_id}>`** — React key collision causes rendering issues

## Solution

Use composite key `student_id + dependent_id` everywhere:

### File: `src/components/ClassReportModal.tsx`

1. **`updateFeedback` function** — add `dependentId` parameter, match on both fields:
```ts
const updateFeedback = (studentId: string, dependentId: string | null | undefined, feedback: string) => {
  setFeedbacks(prev => 
    prev.map(f => 
      (f.student_id === studentId && (f.dependent_id || null) === (dependentId || null)) 
        ? { ...f, feedback } : f
    )
  );
};
```

2. **Feedback lookup in render** — match on both fields:
```ts
const feedback = feedbacks.find(f => 
  f.student_id === participant.student_id && 
  (f.dependent_id || null) === ((participant as any).dependent_id || null)
);
```

3. **React keys** — use composite key:
```tsx
<div key={`${participant.student_id}-${(participant as any).dependent_id || 'self'}`}>
```

4. **`onChange` handler** — pass `dependent_id`:
```tsx
onChange={(e) => updateFeedback(participant.student_id, (participant as any).dependent_id, e.target.value)}
```

5. **Textarea `key` prop** — also use composite:
```tsx
key={`feedback-${participant.student_id}-${(participant as any).dependent_id || 'self'}-${existingReport?.id || 'new'}`}
```

All changes are in a single file. No backend changes needed.




## Issues Found with Amnesty for Dependents

There are **3 bugs** that will cause amnesty to malfunction for dependents in group classes:

### Bug 1: RPC function doesn't return `amnesty_granted` per participant

The `get_classes_with_participants` RPC builds the participant JSON without `amnesty_granted`, `amnesty_granted_by`, or `amnesty_granted_at`. This means the filter `!p.amnesty_granted` in SimpleCalendar (line 632) will always be `undefined` (falsy), so the button will keep showing even after amnesty is granted — until a page refresh where the DB column is checked again. But more critically, the UI cannot know if amnesty was already granted.

**Fix**: Update the RPC to include these 3 fields in the participant JSON object.

### Bug 2: Wrong field paths for dependent names in amnesty section

In SimpleCalendar line 646, the code uses:
```
p.student?.name || p.dependent?.name
```

But the RPC returns `p.profiles.name` (not `p.student.name`) and `p.dependent_name` (flat string, not `p.dependent.name`). So for dependents, the name will always show "Aluno" as fallback.

**Fix**: Change to `p.dependent_name || p.profiles?.name || 'Aluno'` (dependent name takes priority, consistent with rest of the codebase).

### Bug 3: Invoice cancellation doesn't filter by `dependent_id`

When a dependent's class is cancelled with charge, the invoice may have a `dependent_id` field. The current AmnestyButton only filters by `student_id` + `class_id` + `invoice_type`, which could match invoices for the responsible student too, not just the dependent.

**Fix**: Pass `dependentId` to AmnestyButton and use it as an additional filter when cancelling the invoice.

---

### Changes

**1. Database migration** — Update `get_classes_with_participants` RPC to include `amnesty_granted`, `amnesty_granted_by`, `amnesty_granted_at` in participant JSON.

**2. `src/components/Calendar/SimpleCalendar.tsx`** (lines 644-657):
- Fix name display: use `p.dependent_name || p.profiles?.name || 'Aluno'`
- Pass `dependentId={p.dependent_id}` to AmnestyButton

**3. `src/components/AmnestyButton.tsx`**:
- Add optional `dependentId` prop
- When cancelling invoice with `dependentId`, add `.eq('dependent_id', dependentId)` filter (or `.is('dependent_id', null)` when no dependent)

**4. `src/integrations/supabase/types.ts`** — No manual change needed; types auto-update on migration.


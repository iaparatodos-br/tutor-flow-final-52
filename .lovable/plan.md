

## Analysis: No Missing Column Errors, But One Logic Bug Found

All references to `amnesty_granted` on the `classes` table still work because that column was never removed — it was the `class_participants` table that received the **new** columns. No crashes will occur.

However, there is a **logic bug** in the edge function `generate-teacher-notifications`:

### Bug: Notifications keep generating after participant-level amnesty

**File**: `supabase/functions/generate-teacher-notifications/index.ts` (lines 128-170)

**Category 2B** queries `class_participants` for `charge_applied=true` but does **not** filter by `amnesty_granted = false`. After a teacher grants amnesty to a participant, the function will keep generating "amnesty eligible" notifications for that class because:

1. Line 137: Missing `.eq('amnesty_granted', false)` on the `class_participants` query
2. Lines 152-155: Filters by `classes.amnesty_granted = false` which is irrelevant for group classes (amnesty is now per-participant)

### Fix

**`supabase/functions/generate-teacher-notifications/index.ts`**:
1. Add `.eq('amnesty_granted', false)` to the `class_participants` query (line 137)
2. Remove the `.eq('amnesty_granted', false)` filter on `classes` (line 155) since for group classes amnesty is tracked per participant, not per class


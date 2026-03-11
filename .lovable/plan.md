

## Plan: Individual Participant Amnesty for Group Classes

### Problem
Currently, the AmnestyButton operates on the entire class (`classes.amnesty_granted`). In group classes where only one student cancelled, the teacher can't grant amnesty to just that student — it affects the whole class.

### Solution
Make amnesty work at the **participant level** for group classes. The `class_participants` table already has `charge_applied` per participant. We need to add participant-level amnesty tracking and update the UI to show amnesty buttons per cancelled participant.

### Database Changes

**Migration**: Add amnesty fields to `class_participants`:
```sql
ALTER TABLE class_participants 
  ADD COLUMN amnesty_granted boolean DEFAULT false,
  ADD COLUMN amnesty_granted_by uuid,
  ADD COLUMN amnesty_granted_at timestamptz;
```

### Frontend Changes

**1. `src/components/AmnestyButton.tsx`** — Add optional `participantId` prop:
- When `participantId` is provided, operate on `class_participants` (update that row's `charge_applied = false`, `amnesty_granted = true`, etc.)
- When not provided, keep existing class-level behavior for individual classes
- Billing check: query `invoice_classes` filtering by `participant_id` when available
- Invoice cancellation: cancel invoices matching the participant's `student_id` + `class_id` with type `cancellation`

**2. `src/components/Calendar/SimpleCalendar.tsx`** (lines 620-650) — Replace single class-level amnesty with per-participant amnesty:
- For group classes: iterate over cancelled participants with `charge_applied = true` and show an AmnestyButton for each one (passing `participantId`)
- For individual classes: keep existing behavior
- Display participant name next to each amnesty button

**3. `src/pages/Financeiro.tsx`** (line 593) — Update the invoice list amnesty button:
- Pass `participantId` from invoice data when available (from `invoice_classes.participant_id`)
- Keep backward compatibility for class-level amnesty on individual classes

### Translation Updates

**`src/i18n/locales/en/amnesty.json`** and **`pt/amnesty.json`**:
- Update description to reflect individual participant context when applicable

### Summary of Flow
1. Teacher opens cancelled group class in calendar
2. Sees list of cancelled participants with charges
3. Each charged participant has its own "Amnesty" button
4. Clicking grants amnesty only for that participant: updates `class_participants` row, cancels that participant's specific invoice




## Bug: TimePicker `onBlur` never fires when typing directly

### Root Cause

In `time-picker.tsx` line 103, the `onBlur` callback only fires when the Popover closes:
```
onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) onBlur?.(); }}
```

When the user types directly into the input field:
1. Input `onFocus` calls `setOpen(false)` — popover is already closed
2. User types a valid time → `onChange` fires correctly, updating parent state
3. User clicks away → input's `handleInputBlur` runs, but the Popover's `onOpenChange` is **never triggered** because the popover was already closed
4. Therefore `onBlur?.()` (which triggers `handleSave` in WorkingHourRow) **never fires**
5. The typed time is never persisted to the database

When the user later interacts with the Switch or another element, `handleSave` may fire with default values (09:00/18:00) from the initial state if the component re-rendered.

### Fix

**`src/components/ui/time-picker.tsx`**: Call `onBlur?.()` from the input's own `handleInputBlur` as well, so that saving is triggered regardless of whether the popover was used.

**`src/components/Availability/AvailabilityManager.tsx`**: As a secondary safeguard, also call `handleSave` inside the `onChange` callbacks of the TimePickers (not just `onBlur`), so the value is saved as soon as it's committed. This ensures typing a valid 4-digit time auto-saves immediately.

### Changes

1. **`src/components/ui/time-picker.tsx`** — Add `onBlur?.()` call at the end of `handleInputBlur` (after validation/reset)
2. **`src/components/Availability/AvailabilityManager.tsx`** (WorkingHourRow) — No change needed if the TimePicker fix is sufficient; the `onBlur` will now fire correctly after typing


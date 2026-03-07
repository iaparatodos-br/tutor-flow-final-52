

# Add Scroll Support to All Modals Missing It

## Modals Already Fixed (have `max-h` + `overflow-y-auto`)
- `CategoryModal.tsx` ✓
- `MaterialUploadModal.tsx` ✓
- `CalendarView.tsx` ✓
- `ArchivedDataViewer.tsx` ✓
- `ClassForm.tsx` ✓
- `StudentFormModal.tsx` ✓
- `AvailabilityManager.tsx` (working hours dialog) ✓
- `PlanDowngradeSelectionModal.tsx` ✓

## Modals to Fix (add `max-h-[85vh] overflow-y-auto`)

| File | Line | Current className |
|------|------|-------------------|
| `ExpenseCategoryModal.tsx` | 95 | `sm:max-w-md` |
| `ExpenseModal.tsx` | 224 | `sm:max-w-md` |
| `ServiceModal.tsx` | 163 | `max-w-md` |
| `MonthlySubscriptionModal.tsx` | 90 | `sm:max-w-lg` |
| `CancellationModal.tsx` | 376 | `sm:max-w-md` |
| `ShareMaterialModal.tsx` | 342 | `sm:max-w-md` |
| `UpdatePaymentMethodModal.tsx` | 66 | `sm:max-w-md` |
| `PendingBoletoModal.tsx` | 100 | `sm:max-w-lg` |
| `StudentSubscriptionSelect.tsx` | 93 | `sm:max-w-md` |
| `AmnestyButton.tsx` | 147 | `sm:max-w-md` |
| `BusinessProfileWarningModal.tsx` | 36 | `max-w-md` |
| `MonthlySubscriptionsManager.tsx` | 257 | `sm:max-w-2xl` |
| `MaterialCategoryManager.tsx` | 97 | `sm:max-w-md` |
| `ExpenseCategoryManager.tsx` | 98 | `sm:max-w-md` |
| `AvailabilityManager.tsx` (blocks dialog) | 370 | `sm:max-w-[425px]` |
| `ProgressModal.tsx` | 49 | `sm:max-w-[500px]` |

## Change

For each modal above, append `max-h-[85vh] overflow-y-auto` to the existing `DialogContent` className. Example:

```tsx
// Before
<DialogContent className="sm:max-w-md">

// After
<DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
```

16 files, one-line change each. No logic changes.


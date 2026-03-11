

## Fix: Financeiro page crash — broken FK join

### Problem
The query in `Financeiro.tsx` uses `classes!invoices_class_id_fkey(...)` but this foreign key no longer exists in the database schema. The `invoices` table still has a `class_id` column but no FK constraint pointing to `classes`, causing the PGRST200 error.

### Solution
Remove the broken `classes!invoices_class_id_fkey` join from the query. Instead, join through `invoice_classes` to get class-related data (charge_applied, amnesty_granted, is_group_class) needed for the amnesty button.

### Changes

**`src/pages/Financeiro.tsx`** (lines 256-302):
1. Replace `classes!invoices_class_id_fkey(...)` with `invoice_classes(class_id, participant_id, dependent_id, classes(id, status, charge_applied, amnesty_granted, is_group_class))`
2. In the mapping (line 296-303), extract the first `invoice_classes` item's `classes` data to populate `item.class`
3. Update the amnesty button usage (line 604) to also pass `participantId` and `dependentId` from `invoice_classes` when available

This approach uses the existing FK `invoice_classes_class_id_fkey` which does exist, avoiding the broken direct relationship.


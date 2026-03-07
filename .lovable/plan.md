

# Fix: Trigger `ensure_single_default_service` references non-existent column `is_default`

## Problem

The `class_services` table has a trigger `trigger_ensure_single_default_service` that references a column `is_default` which does not exist on the table. This causes a 400 error on every INSERT/UPDATE.

The trigger function `ensure_single_default_service()` checks `NEW.is_default` but the column was never added (or was removed).

## Solution

**Drop the trigger and function** since `class_services` has no `is_default` column and the feature isn't used anywhere in the codebase.

Single SQL migration:

```sql
DROP TRIGGER IF EXISTS trigger_ensure_single_default_service ON public.class_services;
DROP FUNCTION IF EXISTS ensure_single_default_service();
```

No code changes needed — the `ServiceModal` and `ClassServicesManager` components are correct.


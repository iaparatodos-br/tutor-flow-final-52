

## Plan: Remove "Default Billing Day" setting and hardcode default to 1

The `default_billing_day` profile setting only pre-fills the billing day field when registering a new student. It confuses teachers and adds unnecessary complexity. We'll remove the UI setting and hardcode the default to 1.

### Changes

**1. `src/components/Settings/BillingSettings.tsx`**
- Remove `default_billing_day` from the zod schema, form defaults, data loading (`loadSettings`), and save (`onSubmit`)
- Remove the entire `FormField` for `default_billing_day` (the Calendar icon field block)
- Remove the `Calendar` import from lucide-react

**2. `src/components/StudentFormModal.tsx`**
- Remove the `teacherDefaultBillingDay` state and the `useEffect` that loads it from the database
- In `getInitialFormData`, change the fallback from `teacherDefaultBillingDay || 15` to just `1`
- Remove `teacherDefaultBillingDay` from all dependency arrays and function calls
- Simplify: `billing_day: student?.billing_day || 1`

**3. Translation files** (`src/i18n/locales/en/billing.json` and `src/i18n/locales/pt/billing.json`)
- Remove `fields.defaultBillingDay` entries and `validation.dayRange` (only used by that field)

No database migration needed -- the column stays but is simply unused.


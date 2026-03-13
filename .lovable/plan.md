

## Refactor: Amnesty interface in Calendar views

### Build error fix (unrelated)
The `send-boleto-subscription-notification` edge function has a broken `npm:` import for `@aws-sdk/client-ses`. This needs to use `https://esm.sh/` instead, matching the pattern used by `_shared/ses-email.ts`.

### Amnesty refactoring

**1. `src/components/Calendar/CalendarView.tsx` — Update `ClassParticipant` interface**
Add missing fields: `id`, `charge_applied`, `amnesty_granted` to the exported interface so CalendarView can render the compact amnesty button.

**2. `src/components/AmnestyButton.tsx` — Add `variant` prop**
- Add `variant?: "default" | "compact"` to props interface
- In compact mode + billed state: render a small disabled ghost button with `HandHeart` icon wrapped in a Tooltip showing the billed tooltip text
- In compact mode + normal state: render a `size="sm"` ghost Button with just the `HandHeart` icon, wrapped in a Tooltip showing "Conceder Anistia". Clicking opens the same Dialog
- Default variant keeps current behavior unchanged

**3. `src/components/Calendar/CalendarView.tsx` — Inline amnesty in participant rows**
Inside the `participants.map` block (lines 363-406), for cancelled participants where `isProfessor && !participant.amnesty_granted && participant.charge_applied`:
- Add the compact `AmnestyButton` next to the status badge
- Wrap the badge area in a flex container with `items-center gap-1.5`

**4. Standardize modal texts**
Update translation files (`en/amnesty.json` and `pt/amnesty.json`):
- `title`: "Conceder Anistia" (PT) / "Grant Amnesty" (EN) — already correct
- `actions.grant`: already "Conceder Anistia" / "Grant Amnesty" — already correct  
- `description` PT: `"Deseja conceder anistia para <strong>{{studentName}}</strong> nesta aula? Esta ação cancelará a fatura de cancelamento e é irreversível."`
- `description` EN: `"Do you want to grant amnesty for <strong>{{studentName}}</strong> in this class? This action will cancel the cancellation invoice and is irreversible."`

**5. `supabase/functions/send-boleto-subscription-notification/index.ts`** — Fix build error by changing `npm:@aws-sdk/client-ses@3.540.0` to the shared SES import pattern.

**6. `src/pages/Agenda.tsx`** — Ensure `amnesty_granted` is fetched in the `class_participants` queries (lines 752, 823) so the data flows through to CalendarView.


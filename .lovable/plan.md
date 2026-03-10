

## Plan: Add info card to Servicos page

**File**: `src/pages/Servicos.tsx`

**Change**: Add an informational card between the container div opening and the Tabs component. The card will:

- Use `Sparkles` icon from `lucide-react`
- Have gradient background `bg-gradient-to-br from-primary/5 to-transparent`
- Rounded corners `rounded-xl`, subtle border `border border-primary/10`
- Body text in `text-muted-foreground` with the specified Portuguese copy
- Responsive layout with `flex` and proper spacing
- i18n keys added to both `pt/services.json` and `en/services.json` for the card text

**Files to modify**:
1. `src/pages/Servicos.tsx` — add the card JSX and import `Sparkles`
2. `src/i18n/locales/pt/services.json` — add `infoBanner` key with PT text
3. `src/i18n/locales/en/services.json` — add `infoBanner` key with EN translation

The card will only show inside the "services" tab content, right above `<ClassServicesManager />`, so it contextually relates to services only.


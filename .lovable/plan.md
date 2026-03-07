

# Fix: `getClaims is not a function` in Edge Functions

## Root Cause
Previous fixes replaced `getUser()` with `getClaims()` in several edge functions. However, all edge functions import `@supabase/supabase-js@2.45.0`, which does **not** have `getClaims()`. This method exists only in newer versions.

## Solution
Replace the `getClaims()` pattern with the correct approach for v2.45.0: create a **user-scoped client** using the Authorization header, then call `getUser()` on it. This is different from calling `getUser(token)` on a service role client (which was the original broken pattern).

### Pattern to use:
```ts
const userClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  }
);
const { data: { user }, error } = await userClient.auth.getUser();
const authUserId = user.id;
```

## Files to Fix (4 edge functions)

1. **`supabase/functions/process-cancellation/index.ts`** (lines 43-56)
   - Replace `anonClient.auth.getClaims(token)` with `userClient.auth.getUser()`

2. **`supabase/functions/check-subscription-status/index.ts`**
   - Same fix — replace `getClaims` with user-scoped `getUser()`

3. **`supabase/functions/check-email-confirmation/index.ts`**
   - Same fix

4. **`supabase/functions/list-business-profiles/index.ts`**
   - Same fix

All four functions will be redeployed after the code changes.




## Fix: Erro 500 ao Cadastrar Aluno Extra (Student Overage)

### Root Cause Analysis

After reviewing `create-student/index.ts` and `handle-student-overage/index.ts`, there are **3 bugs** causing the 500 error:

#### Bug 1: Missing input validation in `handle-student-overage`
Line 115: `extra_students: extraStudents.toString()` crashes with `Cannot read properties of undefined` if `extraStudents` is undefined or null. Similarly, line 53: `extraStudents * 500` produces `NaN` if undefined. There's no guard clause validating these inputs before processing.

#### Bug 2: `handle-student-overage` not in `config.toml`
The function is NOT listed in `supabase/config.toml`. Since `create-student` invokes it via `supabaseAdmin.functions.invoke()` (using the service_role key), the default `verify_jwt = true` should still work. However, adding explicit config ensures consistent behavior and prevents JWT validation edge cases when called internally.

#### Bug 3: `handle-student-overage` returns non-2xx on failures, blocking student save
When the Stripe charge fails (e.g., `requires_action` for 3D Secure, or no payment method), the function returns status **500** or **400**. The `supabase.functions.invoke()` in `create-student` treats any non-2xx as `billingError`, which triggers rollback of the student account — even in cases where the billing failure is recoverable. The error message shown to the user is generic and unhelpful.

### Fixes

#### 1. `handle-student-overage/index.ts`
- Add guard clause at the top to validate `extraStudents` and `planLimit` are defined and are numbers
- Change error responses from status 500/400 to status **200** with `success: false` — this way `create-student` can properly read the error body via `data` instead of getting a `FunctionsHttpError`
- Validate `stripe_customer_id` is not null before calling Stripe API

#### 2. `supabase/config.toml`
- Add `[functions.handle-student-overage]` with `verify_jwt = false` since this is an internal function called only by `create-student` with service_role key

#### 3. `create-student/index.ts`
- Fix the error handling for the overage call: check `billingData?.success === false` in addition to `billingError`, since after fix #1 the function will return 200 with error details in the body
- Improve the error message to include the actual reason from `handle-student-overage`

### Technical Details

**Files changed:**
- `supabase/functions/handle-student-overage/index.ts` — input validation + response status codes
- `supabase/config.toml` — add function entry
- `supabase/functions/create-student/index.ts` — fix error handling for overage response


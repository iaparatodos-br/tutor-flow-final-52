

# Fix: Email de convite ao aluno nao esta sendo enviado

## Causa raiz

A Edge Function `send-student-invitation/index.ts` usa `createClient` (linha 31) para validar autenticacao, mas **nao importa a funcao**. O unico import e `sendEmail` do `ses-email.ts`.

Logs confirmam:
```
ERROR [send-student-invitation] Exception: ReferenceError: createClient is not defined
```

A funcao `create-student` captura esse erro silenciosamente (linhas 230-233) e continua — o aluno e criado, mas o email nunca e enviado.

## Correcao

### `supabase/functions/send-student-invitation/index.ts`

Adicionar o import do `createClient` do Supabase:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
```

Isso e a unica alteracao necessaria. A logica de autenticacao e envio ja estao corretas — apenas o import estava faltando.

## Arquivo impactado

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/send-student-invitation/index.ts` | Adicionar import do `createClient` |


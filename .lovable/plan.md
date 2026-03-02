

# Revisao do Plano de Timezones: Lacunas e Alteracoes Necessarias

Apos revisao detalhada do codigo e do documento `docs/timezone-multi-support-implementation-plan.md`, identifiquei as seguintes lacunas e pontos que faltaram no plano.

---

## 1. CRITICO: Outros Cron Jobs que dependem de "hoje" e precisam de adaptacao

O plano foca exclusivamente no `automated-billing`, mas ha outros cron jobs que usam `new Date()` para determinar datas e que serao afetados por multi-timezone:

### 1.1 `check-overdue-invoices` (linhas 23-31)
```typescript
const now = new Date();
const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
// .lt("due_date", now.toISOString().split('T')[0])
```
**Problema**: Compara `due_date` (campo `date` no banco) com a data UTC do servidor. Para um professor em `America/New_York` (UTC-5), as 23:00 locais do dia 1, o servidor pensa que ja e dia 2 em UTC. Uma fatura com vencimento no dia 1 seria marcada como vencida antes do fim do dia local do professor.

**Acao necessaria**: Este cron tambem precisa ser convertido para hourly sweeper ou, pelo menos, a comparacao de `due_date` deve considerar o timezone do professor.

### 1.2 `send-class-reminders` (linhas 25-42)
```typescript
const now = new Date();
const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
```
**Problema**: Busca aulas "nas proximas 24h" baseado em UTC. Roda 1x ao dia as 12:00 UTC. Para professores em fusos como UTC+9 (Toquio), "proximas 24h" pode pegar ou nao pegar as aulas certas conforme o timezone.

**Impacto**: Menor, pois `class_date` e armazenado como `timestamptz` e a comparacao funciona absolutamente. Mas o horario de execucao do cron (12h UTC = 9h BRT) pode ser inadequado para outros fusos. Os emails de lembrete formatam data com `timeZone: "America/Sao_Paulo"` hardcoded (linhas 164-174), mostrando hora errada para professores fora de BRT.

**Acao necessaria**: Substituir `timeZone: "America/Sao_Paulo"` pelo timezone do professor (buscar do profile).

### 1.3 `generate-teacher-notifications`
Nao usa datas relativas de forma problematica, mas deve ser revisado.

---

## 2. CRITICO: `getBillingCycleDates` usa `new Date()` internamente

Funcao nas linhas 633-680 do `automated-billing`:
```typescript
function getBillingCycleDates(billingDay: number, referenceDate: Date = new Date()): ...
  const currentDay = referenceDate.getDate();
```
**Problema**: Mesmo passando timezone para a RPC, esta funcao calcula `currentDay` usando `.getDate()` que retorna o dia em UTC, nao no timezone local do professor. Se o cron roda as 22:00 UTC e o professor esta em UTC-5, `.getDate()` retorna o dia de amanha no fuso do professor.

**Correcao no plano**: A funcao `getBillingCycleDates` precisa receber o timezone como parametro e calcular todas as datas usando esse timezone. O plano menciona isto na tabela (linha 157: "Receber timezone e calcular datas no fuso local do professor"), mas nao detalha COMO fazer isso no Deno (sem `date-fns-tz` no backend). Precisamos usar `Intl.DateTimeFormat` no Deno ou incluir `date-fns-tz` tambem nas edge functions.

---

## 3. CRITICO: Verificacao de idempotencia usa `cycleStart.toISOString()` em UTC

Linhas 706-715:
```typescript
.gte('created_at', cycleStart.toISOString())
.lte('created_at', new Date(cycleEnd.getTime() + 86400000).toISOString())
```
**Problema**: Se `cycleStart` for calculado sem timezone (em UTC), a janela de verificacao de duplicatas pode nao coincidir com a janela real do ciclo local. Pode permitir duplicatas ou bloquear faturas legitimas.

**O plano menciona este risco** (linha 172: "A window de `created_at` usada para verificar duplicatas deve ser calculada no timezone do professor"), mas nao propoe solucao concreta.

**Solucao**: Calcular `cycleStart` e `cycleEnd` no timezone do professor antes de usar para a query de idempotencia.

---

## 4. IMPORTANTE: Frontend — Datas hardcoded com `America/Sao_Paulo` ou sem timezone

Encontrei ~20 arquivos com `toLocaleDateString`/`toLocaleTimeString` que nao usam timezone ou usam `America/Sao_Paulo` hardcoded:

| Arquivo | Problema |
|---|---|
| `src/components/Calendar/SimpleCalendar.tsx` | `.toLocaleDateString('pt-BR')` sem timezone, `.toLocaleTimeString('pt-BR')` sem timezone (varias instancias) |
| `src/components/CancellationModal.tsx` | `.toLocaleDateString()` e `.toLocaleTimeString()` sem timezone |
| `src/components/ClassReportModal.tsx` | `.toLocaleDateString('pt-BR')` e `.toLocaleTimeString('pt-BR')` sem timezone |
| `src/components/ClassReportView.tsx` | `.toLocaleDateString()` e `.toLocaleString()` sem timezone |
| `src/pages/PainelNegocios.tsx` | `.toLocaleDateString('pt-BR')` sem timezone |
| `src/pages/Materiais.tsx` | `.toLocaleDateString()` sem timezone |
| `supabase/functions/send-class-reminders/index.ts` | `timeZone: "America/Sao_Paulo"` hardcoded |
| `supabase/functions/automated-billing/index.ts` | `.toLocaleDateString('pt-BR')` sem timezone (linha 412, 472, 696, 939) |

**Acao faltante no plano**: Refatorar `src/utils/timezone.ts` para que as funcoes `formatDateBrazil`, `formatTimeBrazil`, `formatDateTimeBrazil` aceitem um parametro `timezone` (default `America/Sao_Paulo`), e substituir progressivamente os `.toLocaleDateString()` "soltos" por estas funcoes utilitarias.

---

## 5. IMPORTANTE: `create-student/index.ts` nao esta no plano

O plano menciona `create-student` na tabela (linha 60), mas o arquivo atual (`supabase/functions/create-student/index.ts`) nao cria o perfil diretamente — o perfil e criado por um trigger no banco apos `createUser`. O campo `timezone` precisaria ser passado via `user_metadata` e o trigger precisaria le-lo para preencher a coluna, ou a edge function precisaria atualizar o perfil apos criacao.

**Acao faltante**: Detalhar como o timezone chega ao perfil do aluno, dado que o aluno e criado pelo professor (que pode estar em timezone diferente do aluno). Questao: qual timezone usar para o aluno? O do browser do professor no momento? Ou esperar o aluno fazer login e o `useTimezoneSync` atualizar?

**Recomendacao**: Nao enviar timezone do professor como timezone do aluno. Deixar o default (`America/Sao_Paulo`) e o hook `useTimezoneSync` atualizar no primeiro login do aluno.

---

## 6. MEDIO: `ProfileContext.tsx` tambem precisa do campo `timezone`

O plano menciona atualizar a interface `Profile` em `AuthContext.tsx`, mas ha tambem um `ProfileContext.tsx` com sua propria interface `Profile` (sem timezone). Ambas precisam ser atualizadas.

---

## 7. MEDIO: RPC `get_relationships_to_bill_now` precisa retornar timezone

A RPC proposta no plano retorna `SETOF teacher_student_relationships`, mas a edge function precisa do timezone do professor para calcular `getBillingCycleDates` corretamente. A RPC deve retornar tambem `p.timezone` via custom return type ou a edge function deve buscar o timezone separadamente.

**Correcao**: Alterar a RPC para retornar um tipo customizado que inclua `timezone` do professor, ou fazer JOIN na query de enriquecimento que ja busca `profiles`.

---

## 8. BAIXO: `date-fns-tz` no backend (Edge Functions / Deno)

O plano so adiciona `date-fns-tz` ao frontend (`package.json`). As Edge Functions rodam em Deno e nao usam `package.json`. Para usar `date-fns-tz` nas edge functions, seria necessario importar via `esm.sh`:

```typescript
import { utcToZonedTime, format } from "https://esm.sh/date-fns-tz@2.0.0";
```

Alternativamente, usar `Intl.DateTimeFormat` nativo do Deno para operacoes de timezone no backend (sem dependencia extra).

**Recomendacao**: Para as edge functions, usar `Intl.DateTimeFormat` (ja disponivel no Deno) em vez de adicionar dependencia. Documentar esta decisao.

---

## 9. BAIXO: Cron jobs existentes — inventario completo

Cron jobs ativos que devem ser revisados para timezone-awareness:

| Job | Schedule | Impacto Timezone |
|---|---|---|
| `automated-billing-daily` | `0 9 * * *` | CRITICO — refatorar para hourly |
| `send-class-reminders-daily` | `0 12 * * *` | MEDIO — emails com timezone hardcoded |
| `auto-verify-pending-invoices` | `0 */3 * * *` | BAIXO — ja e horario, verifica status Stripe |
| `process-expired-subscriptions-daily` | `0 10 * * *` | BAIXO — compara datas absolutas |
| `monthly-data-archiver` | `0 3 1 * *` | NENHUM — archiving nao e sensivel a timezone |
| `cleanup-orphaned-stripe-events` | `*/15 * * * *` | NENHUM |
| `process-orphan-cancellation-charges-weekly` | semanal | BAIXO |

---

## 10. Proposta de Atualizacao do Documento

Atualizar `docs/timezone-multi-support-implementation-plan.md` com:

1. **Novo Passo 5.1**: Refatorar `send-class-reminders` para usar timezone do professor nos emails.
2. **Novo Passo 5.2**: Refatorar `check-overdue-invoices` para considerar timezone na comparacao de `due_date`.
3. **Expandir Passo 5**: Detalhar como `getBillingCycleDates` recebe e usa timezone (via `Intl.DateTimeFormat` no Deno).
4. **Expandir Passo 5**: RPC deve retornar timezone do professor.
5. **Novo Passo 8**: Refatorar `src/utils/timezone.ts` para aceitar timezone dinamico como parametro.
6. **Expandir secao 3**: Adicionar todos os arquivos frontend com datas hardcoded.
7. **Expandir secao 4**: Adicionar risco sobre `create-student` (timezone do aluno vs do professor).
8. **Nota tecnica**: Documentar uso de `Intl.DateTimeFormat` no Deno (edge functions) em vez de `date-fns-tz`.
9. **Atualizar `ProfileContext.tsx`** na tabela de arquivos impactados.


# Plano de Implementação: Suporte a Múltiplos Fusos Horários

> **Status**: Pendente de implementação  
> **Data**: 2026-03-02  
> **Versão**: 2.2 (expandida com edge functions de notificação + arquivos frontend adicionais + 5 edge functions faltantes)

---

## 1. Contexto e Motivação

O sistema **Tutor Flow** opera atualmente com fuso horário fixo de Brasília (`America/Sao_Paulo`, UTC-3). Esta abordagem simplifica o desenvolvimento, mas impede a expansão para tutores e alunos em outros fusos horários.

### Objetivo

Evoluir o sistema para suporte multi-timezone com:
- **Detecção automática** no frontend (sem selects/dropdowns nesta fase).
- **Hourly Sweeper** no backend para billing timezone-aware.
- **Retrocompatibilidade** total com utilizadores existentes.

### Princípios

1. **Frictionless UX** — detecção 100% automática, sem interação manual para escolha de timezone.
2. **Retrocompatível** — utilizadores existentes mantêm `America/Sao_Paulo` como default.
3. **Idempotente** — execução horária do billing não pode gerar faturas duplicadas.

---

## 2. Passos de Implementação

### Passo 1: Migração da Base de Dados

Adicionar coluna `timezone` à tabela `profiles`:

```sql
ALTER TABLE public.profiles 
ADD COLUMN timezone text NOT NULL DEFAULT 'America/Sao_Paulo';
```

- Tipo `text` para armazenar identificadores IANA (ex: `'Europe/Lisbon'`, `'America/New_York'`).
- Default `'America/Sao_Paulo'` garante retrocompatibilidade.
- Todos os utilizadores existentes recebem automaticamente o valor default.

---

### Passo 2: Frontend — Capturar Timezone no Registo/Login

#### Detecção Automática

Usar a API nativa do browser:

```typescript
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
```

#### Arquivos a alterar

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-teacher/index.ts` | Aceitar campo `timezone` no body; preencher coluna ao criar perfil |
| `src/contexts/AuthContext.tsx` | No `signUp`, capturar timezone do browser e enviar no payload |
| `src/components/ProfileSetup.tsx` | Ao submeter profile setup, enviar timezone do browser |

#### Nota sobre `create-student`

O perfil do aluno é criado por um **trigger no banco** após `auth.users.insert` — não pela edge function diretamente. O timezone do aluno **NÃO** deve ser copiado do professor que o criou (podem estar em fusos diferentes).

**Decisão**: Deixar o default (`America/Sao_Paulo`) e o hook `useTimezoneSync` (Passo 3) atualizar no primeiro login do aluno.

#### Fallback

Se `Intl.DateTimeFormat` não estiver disponível ou retornar `undefined`, usar `'America/Sao_Paulo'` silenciosamente.

---

### Passo 3: Hook `useTimezoneSync` — Sincronização Inteligente

#### Novo arquivo: `src/hooks/useTimezoneSync.ts`

Custom hook que:

1. Roda após login / carregamento da app (quando `profile` está disponível).
2. Obtém `profile.timezone` via `useAuth()` (o `AuthContext` já carrega o campo após o Passo 2).
3. Compara `Intl.DateTimeFormat().resolvedOptions().timeZone` com `profile.timezone`.
4. Se diferentes, mostra toast com ação:
   > _"Detetámos que estás num novo fuso horário ([novo]). Queres atualizar?"_
5. Se o utilizador aceitar, faz mutation para atualizar a coluna `timezone` no Supabase.
6. Usa `sessionStorage` para não repetir o toast na mesma sessão se o utilizador recusar.

#### Integração

- Chamar `useTimezoneSync()` no `Layout.tsx` (componente que envolve todas as rotas autenticadas).

#### Atualizar interfaces `Profile`

- Adicionar campo `timezone: string` na interface `Profile` em `AuthContext.tsx`.
- Adicionar campo `timezone?: string` na interface `Profile` em `ProfileContext.tsx`.
- Incluir `timezone` no `loadProfile`.

---

### Passo 4: Alterar Cron Job para Execução Horária

#### Configuração atual

```
jobname: automated-billing-daily
schedule: 0 9 * * *  (diário às 09:00 UTC)
```

#### Nova configuração

```
jobname: automated-billing-hourly
schedule: 0 * * * *  (a cada hora, minuto 0)
```

#### Ação

Executar SQL para:
1. `SELECT cron.unschedule('automated-billing-daily');`
2. `SELECT cron.schedule('automated-billing-hourly', '0 * * * *', ...);`

---

### Passo 5: Refatorar `automated-billing` (Hourly Sweeper)

#### Lógica atual (problema)

```typescript
const today = new Date().getDate(); // Usa UTC do servidor
// .eq('billing_day', today)
```

Usa `new Date()` (UTC do servidor) para determinar o dia de billing. Falha para utilizadores em fusos diferentes de UTC.

#### Nova lógica — RPC PostgreSQL

Criar função `get_relationships_to_bill_now()` com **retorno customizado** que inclui timezone:

```sql
CREATE TYPE billing_relationship_with_tz AS (
  -- campos de teacher_student_relationships
  id uuid,
  teacher_id uuid,
  student_id uuid,
  billing_day integer,
  is_active boolean,
  monthly_subscription_id uuid,
  -- campo adicional
  teacher_timezone text
);

CREATE OR REPLACE FUNCTION public.get_relationships_to_bill_now()
RETURNS SETOF billing_relationship_with_tz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    tsr.id,
    tsr.teacher_id,
    tsr.student_id,
    tsr.billing_day,
    tsr.is_active,
    tsr.monthly_subscription_id,
    COALESCE(p.timezone, 'America/Sao_Paulo') AS teacher_timezone
  FROM teacher_student_relationships tsr
  JOIN profiles p ON p.id = tsr.teacher_id
  WHERE tsr.is_active = true
    AND tsr.billing_day = EXTRACT(DAY FROM (now() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo')))
    AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo'))) = 1
$$;
```

**Lógica**: Retorna apenas os relacionamentos cujo professor está na hora `01:00` local. A maioria das execuções horárias retorna 0 registros. **Inclui o timezone do professor** para uso no cálculo de `getBillingCycleDates`.

#### Alterações na Edge Function

| Local | Mudança |
|---|---|
| Query de billing day | Substituir `.eq('billing_day', today)` pela chamada à RPC |
| `getBillingCycleDates` | Receber `timezone` como parâmetro e usar `Intl.DateTimeFormat` para calcular datas no fuso local |

#### Detalhe: `getBillingCycleDates` com timezone (Deno)

```typescript
function getBillingCycleDates(billingDay: number, timezone: string): { cycleStart: Date; cycleEnd: Date } {
  // Usar Intl.DateTimeFormat para obter o dia local no timezone do professor
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(now);
  const localYear = parseInt(parts.find(p => p.type === 'year')!.value);
  const localMonth = parseInt(parts.find(p => p.type === 'month')!.value);
  const localDay = parseInt(parts.find(p => p.type === 'day')!.value);
  
  // Calcular cycleStart e cycleEnd baseado no dia local
  // ... lógica existente usando localYear, localMonth, localDay
}
```

**Nota técnica**: No Deno (Edge Functions), usar `Intl.DateTimeFormat` nativo em vez de `date-fns-tz`. Ver seção "Decisões Técnicas" abaixo.

---

### Passo 5.1: Refatorar Edge Functions de Notificação (Timezone nos Emails)

Todas as edge functions que formatam datas em emails usam `timeZone: "America/Sao_Paulo"` hardcoded. Cada uma precisa buscar o timezone do professor via JOIN em `profiles` antes de formatar.

#### 5.1.1 `send-class-reminders/index.ts`

Os emails de lembrete formatam datas com `timeZone: "America/Sao_Paulo"` hardcoded (linhas 164-174):

```typescript
const formattedDate = classDateTime.toLocaleDateString("pt-BR", {
  timeZone: "America/Sao_Paulo", // HARDCODED
});
```

**Ação**: Buscar timezone do professor na query de profiles (já é feita na linha 73-77). Substituir pelo timezone dinâmico.

**Impacto no cron schedule**: Mínimo — a busca de aulas nas "próximas 24h" usa `timestamptz` e a comparação funciona em qualquer fuso. Apenas a formatação nos emails precisa de ajuste.

#### 5.1.2 `send-class-confirmation-notification/index.ts`

2 ocorrências de `timeZone: "America/Sao_Paulo"` na formatação de data/hora da aula confirmada.

**Ação**: Buscar timezone do professor via query de profiles e substituir.

#### 5.1.3 `send-cancellation-notification/index.ts`

1 ocorrência de `timeZone: 'America/Sao_Paulo'` na formatação de data/hora do cancelamento.

**Ação**: Buscar timezone do professor via query de profiles e substituir.

#### 5.1.4 `send-invoice-notification/index.ts`

1 ocorrência de `timeZone: "America/Sao_Paulo"` na formatação de `due_date`.

**Ação**: Buscar timezone do professor via query de profiles e substituir. **Atenção especial**: `due_date` é campo `date` (sem hora) — ao formatar com timezone, usar a técnica de "ignorar offset" para evitar o bug de exibição de dia anterior (ver memory constraint `database-date-timezone-rendering`).

#### 5.1.5 `send-class-request-notification/index.ts`

2 ocorrências de `timeZone: "America/Sao_Paulo"` na formatação de data/hora da aula solicitada.

**Ação**: Buscar timezone do professor via query de profiles e substituir.

#### 5.1.6 `send-class-report-notification/index.ts`

2 ocorrências de formatação de data/hora sem timezone (linhas 174-177):

```typescript
const formattedDate = classDate.toLocaleDateString('pt-BR');
const formattedTime = classDate.toLocaleTimeString('pt-BR', { 
  hour: '2-digit', minute: '2-digit' 
});
```

**Impacto**: Emails de notificação de relatório de aula mostram data/hora no fuso do servidor (UTC), não do professor.

**Ação**: Buscar timezone do professor e passar como opção `timeZone` na formatação.

#### 5.1.7 `send-boleto-subscription-notification/index.ts`

Função helper `formatDate` (linhas 34-39) formata datas SEM timezone:

```typescript
const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
};
```

**Impacto**: Datas de vencimento de boleto nos emails de assinatura podem exibir dia errado para professores fora de BRT (especialmente `due_date` que é campo `date`).

**Ação**: Parametrizar `formatDate` para receber timezone e buscar do professor.

#### 5.1.8 `process-cancellation/index.ts`

1 ocorrência sem timezone na descrição de fatura (linha 470):

```typescript
const classDateFormatted = new Date(classData.class_date).toLocaleDateString('pt-BR');
```

**Impacto**: Descrições de faturas de cancelamento podem mostrar data errada (dia anterior/posterior) dependendo do fuso do professor.

**Ação**: Buscar timezone do professor (já disponível no contexto da função) e usar na formatação.

#### 5.1.9 `process-orphan-cancellation-charges/index.ts`

1 ocorrência sem timezone na descrição de fatura (linha 233):

```typescript
description: `Cancelamento - ${service?.name || 'Aula'} - ${new Date(participant.classData.class_date).toLocaleDateString('pt-BR')}`,
```

**Impacto**: Descrições de faturas órfãs com data potencialmente incorreta.

**Ação**: Buscar timezone do professor e usar na formatação.

#### 5.1.10 `create-invoice/index.ts`

1 ocorrência sem timezone na descrição de item de fatura (linha 352):

```typescript
let itemDescription = `${service?.name || 'Aula'} - ${new Date(classInfo.class_date).toLocaleDateString('pt-BR')}`;
```

**Impacto**: Descrições de itens de fatura manual com data potencialmente incorreta.

**Ação**: O `teacher_id` já está disponível no contexto. Buscar timezone e usar na formatação.

---

### Passo 5.2: Refatorar `check-overdue-invoices` (Timezone na Comparação de Due Dates)

#### Problema atual

```typescript
const now = new Date();
// .lt("due_date", now.toISOString().split('T')[0])
```

Compara `due_date` (campo `date`) com a data UTC do servidor. Para um professor em `America/New_York` (UTC-5), às 23:00 locais do dia 1, o servidor pensa que já é dia 2 em UTC. Faturas podem ser marcadas como vencidas antes do fim do dia local do professor.

#### Ação

Duas abordagens possíveis:

**Opção A (Recomendada)**: Converter para hourly sweeper similar ao billing:
- Buscar faturas pendentes com JOIN em profiles para obter timezone.
- Comparar `due_date` com a data local do professor.

**Opção B**: Manter execução diária mas usar a data local:
- Para cada fatura, buscar o timezone do professor.
- Calcular a data local do professor antes de comparar.

```typescript
// Exemplo com Intl (Opção B)
const teacherLocalDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: teacherTimezone,
}).format(new Date()); // Retorna 'YYYY-MM-DD'

// Comparar com due_date
if (invoice.due_date < teacherLocalDate) {
  // Fatura vencida no fuso do professor
}
```

---

### Passo 6: Garantia de Idempotência (CRÍTICO)

A idempotência **já existe** no código atual:

- **Billing mensal**: Verifica `existingMonthlyInvoice` por `teacher_id + student_id + invoice_type + monthly_subscription_id + created_at range` (linhas ~706-725 do `automated-billing`).
- **Billing por aula**: Garantida pela RPC `get_unbilled_participants_v2` que só retorna participantes não faturados.

Com execução horária, estas verificações continuam válidas.

#### Ponto de atenção CRÍTICO

A window de `created_at` usada para verificar duplicatas **deve ser calculada no timezone do professor**, não em UTC:

```typescript
// ANTES (UTC — pode causar problemas):
.gte('created_at', cycleStart.toISOString())

// DEPOIS (timezone-aware):
// cycleStart e cycleEnd já calculados via getBillingCycleDates(billingDay, timezone)
// Converter para UTC antes de usar na query
const cycleStartUTC = new Date(
  Date.UTC(cycleStart.year, cycleStart.month - 1, cycleStart.day, 0, 0, 0)
  - getOffsetForTimezone(timezone) // offset em ms
);
```

**Alternativa mais simples**: Como `cycleStart` e `cycleEnd` agora são calculados com o timezone correto, basta converter para ISO string (UTC) corretamente antes da query. O importante é que o intervalo represente o ciclo correto.

---

### Passo 7: Dependência `date-fns-tz` (Frontend)

Adicionar ao `package.json`:

```bash
bun add date-fns-tz
```

Para uso no **frontend** em:
- Componentes de calendário com formatação timezone-aware.
- Conversões visuais de horários entre fusos.
- Substituição progressiva do `moment.js`.

---

### Passo 8: Refatorar `src/utils/timezone.ts` (Frontend)

#### Problema atual

As funções utilitárias (`formatDateBrazil`, `formatTimeBrazil`, `formatDateTimeBrazil`) usam `BRAZIL_TIMEZONE` hardcoded:

```typescript
export const BRAZIL_TIMEZONE = 'America/Sao_Paulo';
```

#### Ação

Refatorar para aceitar timezone dinâmico como parâmetro, mantendo retrocompatibilidade:

```typescript
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export const formatDate = (
  date: Date | string, 
  timezone: string = DEFAULT_TIMEZONE,
  options?: Intl.DateTimeFormatOptions
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options
  };
  return dateObj.toLocaleDateString('pt-BR', defaultOptions);
};
```

#### Arquivos frontend com datas hardcoded a migrar

| Arquivo | Problema |
|---|---|
| `src/components/Calendar/SimpleCalendar.tsx` | `.toLocaleDateString('pt-BR')` e `.toLocaleTimeString('pt-BR')` sem timezone (várias instâncias) |
| `src/components/Calendar/MobileCalendarList.tsx` | `.toLocaleTimeString()` sem timezone |
| `src/components/CancellationModal.tsx` | `.toLocaleDateString()` e `.toLocaleTimeString()` sem timezone |
| `src/components/ClassReportModal.tsx` | `.toLocaleDateString('pt-BR')` e `.toLocaleTimeString('pt-BR')` sem timezone |
| `src/components/ClassReportView.tsx` | `.toLocaleDateString()` e `.toLocaleString()` sem timezone |
| `src/components/PendingBoletoModal.tsx` | `.toLocaleDateString()` sem timezone |
| `src/components/StudentScheduleRequest.tsx` | `formatDate`/`formatTime` locais sem timezone (4+ ocorrências) |
| `src/components/BusinessProfilesManager.tsx` | `.toLocaleDateString()` sem timezone |
| `src/components/Settings/CancellationPolicySettings.tsx` | `.toLocaleDateString()` sem timezone (2 ocorrências) |
| `src/pages/PainelNegocios.tsx` | `.toLocaleDateString('pt-BR')` sem timezone |
| `src/pages/Materiais.tsx` | `.toLocaleDateString()` sem timezone |
| `src/pages/MeusMateriais.tsx` | `.toLocaleDateString()` sem locale/timezone |
| `src/pages/PerfilAluno.tsx` | ~8 chamadas (datas de aulas, cadastro, nascimento, vencimento) |
| `src/pages/Financeiro.tsx` | `formatDate` local sem timezone |
| `src/pages/Agenda.tsx` | `.toLocaleDateString()` para descrição de fatura |

Estes ficheiros devem ser progressivamente migrados para usar as funções de `src/utils/timezone.ts` com o timezone do utilizador (obtido via `useAuth()`).

**Excluído da migração**: `src/pages/DevValidation.tsx` — usa `toLocaleTimeString` apenas para timestamps de log de debug. Não impacta utilizadores.

---

## 3. Arquivos Impactados (Completo)

| Arquivo | Tipo de Mudança |
|---|---|
| Migration SQL (`profiles.timezone`) | Nova coluna |
| RPC SQL `get_relationships_to_bill_now` | Nova função PostgreSQL + tipo customizado |
| `supabase/functions/create-teacher/index.ts` | Aceitar campo timezone |
| `supabase/functions/automated-billing/index.ts` | Refatorar para hourly sweeper + timezone em `getBillingCycleDates` + 4 `toLocaleDateString` internos |
| `supabase/functions/check-overdue-invoices/index.ts` | Comparação de due_date timezone-aware |
| `supabase/functions/send-class-reminders/index.ts` | Formatação de datas com timezone do professor |
| `supabase/functions/send-class-confirmation-notification/index.ts` | Substituir 2x `timeZone: "America/Sao_Paulo"` hardcoded |
| `supabase/functions/send-cancellation-notification/index.ts` | Substituir 1x `timeZone: 'America/Sao_Paulo'` hardcoded |
| `supabase/functions/send-invoice-notification/index.ts` | Substituir 1x `timeZone: "America/Sao_Paulo"` hardcoded + tratar `date` offset |
| `supabase/functions/send-class-request-notification/index.ts` | Substituir 2x `timeZone: "America/Sao_Paulo"` hardcoded |
| `supabase/functions/send-class-report-notification/index.ts` | Adicionar timezone na formatação de data/hora (2 ocorrências) |
| `supabase/functions/send-boleto-subscription-notification/index.ts` | Parametrizar `formatDate` com timezone |
| `supabase/functions/process-cancellation/index.ts` | Usar timezone na descrição de fatura |
| `supabase/functions/process-orphan-cancellation-charges/index.ts` | Usar timezone na descrição de fatura |
| `supabase/functions/create-invoice/index.ts` | Usar timezone na descrição de item |
| `src/contexts/AuthContext.tsx` | Interface Profile + signUp payload |
| `src/contexts/ProfileContext.tsx` | Interface Profile com campo `timezone` |
| `src/hooks/useTimezoneSync.ts` | **Novo** — hook de sincronização |
| `src/utils/timezone.ts` | Refatorar funções para aceitar timezone dinâmico |
| `src/components/Layout.tsx` | Integrar hook |
| `src/components/ProfileSetup.tsx` | Enviar timezone no setup |
| `src/components/Calendar/SimpleCalendar.tsx` | Migrar datas para utilitário |
| `src/components/Calendar/MobileCalendarList.tsx` | Migrar datas para utilitário |
| `src/components/CancellationModal.tsx` | Migrar datas para utilitário |
| `src/components/ClassReportModal.tsx` | Migrar datas para utilitário |
| `src/components/ClassReportView.tsx` | Migrar datas para utilitário |
| `src/components/PendingBoletoModal.tsx` | Migrar datas para utilitário |
| `src/components/StudentScheduleRequest.tsx` | Migrar datas para utilitário |
| `src/components/BusinessProfilesManager.tsx` | Migrar datas para utilitário |
| `src/components/Settings/CancellationPolicySettings.tsx` | Migrar datas para utilitário |
| `src/pages/PainelNegocios.tsx` | Migrar datas para utilitário |
| `src/pages/Materiais.tsx` | Migrar datas para utilitário |
| `src/pages/MeusMateriais.tsx` | Migrar datas para utilitário |
| `src/pages/PerfilAluno.tsx` | Migrar ~8 chamadas de datas para utilitário |
| `src/pages/Financeiro.tsx` | Migrar datas para utilitário |
| `src/pages/Agenda.tsx` | Migrar datas para utilitário |
| Cron job SQL | Alterar schedule para horário |
| `package.json` | Adicionar `date-fns-tz` |

---

## 4. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Utilizadores existentes sem timezone | Nula | — | Default `'America/Sao_Paulo'` na coluna |
| Cron horário = 24x mais invocações | Média | Baixo | RPC filtra no Postgres; maioria retorna 0 registros |
| Billing cycle dates calculados em UTC vs local | Alta | Alto | Passar timezone para `getBillingCycleDates`; usar `Intl` no Deno |
| `date-fns-tz` conflito com `moment.js` | Baixa | Baixo | São libs independentes, sem conflito |
| Browser sem suporte a `Intl.DateTimeFormat` | Muito baixa | Baixo | Fallback silencioso para `'America/Sao_Paulo'` |
| Toast de timezone incomodar utilizadores | Baixa | Baixo | `sessionStorage` limita a 1x por sessão |
| Timezone do aluno criado pelo professor | Média | Baixo | Não copiar timezone do professor; `useTimezoneSync` atualiza no 1º login do aluno |
| Faturas marcadas como vencidas prematuramente | Alta | Alto | `check-overdue-invoices` deve considerar timezone do professor (Passo 5.2) |
| Idempotência com janela UTC incorreta | Média | Alto | Calcular `cycleStart`/`cycleEnd` no timezone local antes de query |
| Emails com horário errado para fusos não-BRT | Alta | Médio | `send-class-reminders` usar timezone do professor (Passo 5.1) |

---

## 5. Plano de Testes

### Testes Unitários

1. **Hook `useTimezoneSync`**: Verificar que detecta diferença e mostra toast.
2. **RPC `get_relationships_to_bill_now`**: Testar com profiles em diferentes fusos, validar que só retorna os corretos para a hora atual.
3. **`getBillingCycleDates` com timezone**: Verificar cálculo correto para `America/Sao_Paulo`, `America/New_York`, `Europe/Lisbon`, `Asia/Tokyo`.

### Testes de Integração

1. **Registo com timezone**: Criar professor, verificar que `profiles.timezone` foi preenchido.
2. **Billing horário**: Simular execução em diferentes horas UTC e validar que apenas os professores no fuso correto são processados.
3. **Idempotência**: Executar billing 2x na mesma hora e verificar que não duplica faturas.
4. **Check-overdue-invoices**: Verificar que fatura com `due_date` hoje não é marcada como vencida para professor em UTC-5 quando são 23:00 locais.
5. **Send-class-reminders**: Verificar que emails mostram horário correto para professor em fuso não-BRT.

### Testes de Regressão

1. **Utilizadores existentes**: Verificar que billing continua funcionando normalmente com default `'America/Sao_Paulo'`.
2. **Fluxo de login/signup**: Verificar que timezone é capturado sem erros.
3. **Calendar/Agenda**: Verificar que a visualização de aulas não é afetada pela nova coluna.

---

## 6. Inventário de Cron Jobs

| Job | Schedule | Impacto Timezone | Ação |
|---|---|---|---|
| `automated-billing-daily` | `0 9 * * *` | **CRÍTICO** | Refatorar para hourly sweeper (Passo 4+5) |
| `send-class-reminders-daily` | `0 12 * * *` | **MÉDIO** | Emails com timezone do professor (Passo 5.1) |
| `check-overdue-invoices` | diário | **CRÍTICO** | Comparação timezone-aware (Passo 5.2) |
| `auto-verify-pending-invoices` | `0 */3 * * *` | Baixo | Já é horário; verifica status Stripe (sem ação) |
| `process-expired-subscriptions-daily` | `0 10 * * *` | Baixo | Compara datas absolutas (sem ação) |
| `monthly-data-archiver` | `0 3 1 * *` | Nenhum | Archiving não é sensível a timezone |
| `cleanup-orphaned-stripe-events` | `*/15 * * * *` | Nenhum | Limpeza temporal (sem ação) |
| `process-orphan-cancellation-charges-weekly` | semanal | Baixo | Sem ação imediata |

---

## 7. Decisões Técnicas

### `Intl.DateTimeFormat` no Deno (Edge Functions)

**Decisão**: Usar `Intl.DateTimeFormat` nativo do Deno para operações de timezone nas Edge Functions, em vez de importar `date-fns-tz` via `esm.sh`.

**Justificativa**:
- `Intl.DateTimeFormat` já está disponível nativamente no Deno runtime.
- Evita dependência externa e potenciais problemas de versão.
- Performance superior (nativo vs importação HTTP).
- Cobre os casos de uso necessários (formatar datas, extrair componentes de data no timezone local).

**Exemplo de uso no Deno**:

```typescript
// Obter o dia local no timezone do professor
function getLocalDay(timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    day: 'numeric',
  });
  return parseInt(formatter.format(new Date()));
}

// Obter data local completa
function getLocalDateParts(timezone: string): { year: number; month: number; day: number; hour: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  return {
    year: parseInt(parts.find(p => p.type === 'year')!.value),
    month: parseInt(parts.find(p => p.type === 'month')!.value),
    day: parseInt(parts.find(p => p.type === 'day')!.value),
    hour: parseInt(parts.find(p => p.type === 'hour')!.value),
  };
}
```

### `date-fns-tz` apenas no Frontend

**Decisão**: Adicionar `date-fns-tz` apenas ao `package.json` (frontend). Não usar nas Edge Functions.

**Uso no frontend**: Componentes de calendário, formatação de horários, substituição progressiva de `moment.js`.

---

## 8. Sequência de Execução Recomendada

1. ✅ Criar este documento de referência
2. ⬜ Migração DB (Passo 1) — adicionar coluna `timezone`
3. ⬜ Adicionar `date-fns-tz` ao frontend (Passo 7) — sem risco
4. ⬜ Refatorar `src/utils/timezone.ts` (Passo 8) — aceitar timezone dinâmico
5. ⬜ Frontend: capturar timezone no registo (Passo 2)
6. ⬜ Frontend: hook `useTimezoneSync` (Passo 3)
7. ⬜ Frontend: migrar componentes com datas hardcoded (Passo 8, tabela)
8. ⬜ Backend: criar RPC `get_relationships_to_bill_now` (Passo 5)
9. ⬜ Backend: refatorar `automated-billing` (Passo 5)
10. ⬜ Backend: refatorar `send-class-reminders` (Passo 5.1.1)
11. ⬜ Backend: refatorar notificações restantes (Passos 5.1.2–5.1.5)
12. ⬜ Backend: refatorar edge functions faltantes (Passos 5.1.6–5.1.10)
13. ⬜ Backend: refatorar `check-overdue-invoices` (Passo 5.2)
13. ⬜ Cron job: alterar billing para horário (Passo 4)
13. ⬜ Validar idempotência com timezone (Passo 6)
14. ⬜ Testes end-to-end

---

## 9. Referências

- [Documentação atual de timezone](../docs/timezone-implementation.md)
- [Utilitários de timezone](../src/utils/timezone.ts)
- [IANA Time Zone Database](https://www.iana.org/time-zones)
- [`date-fns-tz` docs](https://github.com/marnusw/date-fns-tz)

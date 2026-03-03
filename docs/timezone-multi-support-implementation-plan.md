# Plano de Implementação: Suporte a Múltiplos Fusos Horários

> **Status**: Pendente de implementação  
> **Data**: 2026-03-03  
> **Versão**: 3.6.2 (v3.6.1 + revisão Gemini #6: adicionado `CreateInvoiceModal.tsx` à tabela de migração do Passo 8 — 40 componentes)

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

#### Escape Hatch: Seletor Manual de Timezone (v3.5)

Mesmo com a detecção automática como fluxo principal, adicionar um `<Select>` de timezone em `src/components/Settings/ProfileSettings.tsx` (dentro de Configurações → Perfil). Funciona como "escape hatch" para:
- Utilizadores que recusaram acidentalmente a atualização do toast.
- Utilizadores usando VPN cujo `Intl` retorna timezone incorreto.
- Casos de suporte técnico.

O componente deve listar os timezones IANA mais comuns (ou todos via `Intl.supportedValuesOf('timeZone')` onde disponível) e fazer mutation para atualizar `profiles.timezone` ao selecionar.

**Prioridade**: Baixa — não bloqueia a fase principal. Pode ser implementado após o Passo 8.

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
    AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo'))) >= 1
    AND NOT EXISTS (
      SELECT 1 FROM invoices i 
      WHERE i.teacher_id = tsr.teacher_id 
        AND i.student_id = tsr.student_id
        AND i.invoice_type = 'monthly'
        AND i.created_at >= ((now() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo'))::date)::timestamptz
    )
$$;
```

**Lógica**: Retorna relacionamentos cujo professor já passou da `01:00` local **e** que ainda não foram cobrados "hoje local". Isso torna o sweeper **auto-corretivo**: se o cron falhar às 01:00 UTC, a execução das 02:00 recupera automaticamente. A cláusula `NOT EXISTS` garante idempotência na própria query SQL. **Inclui o timezone do professor** para uso no cálculo de `getBillingCycleDates`.

#### Alterações na Edge Function

| Local | Mudança |
|---|---|
| Query de billing day | Substituir `.eq('billing_day', today)` pela chamada à RPC |
| `getBillingCycleDates` | Receber `timezone` como parâmetro e usar `Intl.DateTimeFormat` para calcular datas no fuso local |
| Cálculo de `due_date` | Usar `Intl.DateTimeFormat` com timezone do professor para calcular "hoje local" antes de adicionar `payment_due_days` (3 ocorrências: billing tradicional, mensalidade, aulas fora do ciclo) |

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

Todas as edge functions que formatam datas em emails usam `timeZone: "America/Sao_Paulo"` hardcoded. Cada uma precisa buscar o timezone do **destinatário** via JOIN em `profiles` antes de formatar.

#### REGRA CRÍTICA: Campos `date` (sem hora) — NUNCA formatar com `timeZone` (v3.6)

Campos do tipo `date` no Postgres (como `due_date`, `starts_at`, `expense_date`, `birth_date`) são strings `YYYY-MM-DD` sem componente de hora. Converter para `new Date('2026-03-10')` cria meia-noite UTC; formatar com `timeZone: 'America/Sao_Paulo'` (UTC-3) recua 3h e exibe **09/03/2026** — um bug off-by-one.

**Diretriz obrigatória**: Campos `date` NUNCA devem ser convertidos para `Date` e formatados com opção `timeZone`. Devem ser:
1. Parseados como string (`split('-')`) e montados localmente, ou
2. Usar `parseISO` do date-fns (que trata como data local, sem offset UTC).

```typescript
// ❌ ERRADO — off-by-one em fusos negativos
const formatted = new Date(invoice.due_date).toLocaleDateString("pt-BR", {
  timeZone: recipientTimezone,
});

// ✅ CORRETO — parse como data local
import { parseISO, format } from 'date-fns';
const formatted = format(parseISO(invoice.due_date), 'dd/MM/yyyy');
```

#### REGRA CRÍTICA: Timezone do Destinatário (v3.3)

- **Email para o professor** → usar `profiles.timezone` do professor.
- **Email para o aluno/responsável** → usar `profiles.timezone` do aluno.
- **Boa prática UX**: Sempre incluir acrônimo do fuso no corpo do email (ex: "15:00 BRT") via opção `timeZoneName: 'short'` no `Intl.DateTimeFormat`. Elimina ambiguidade quando professor e aluno estão em fusos diferentes.

```typescript
// Exemplo de formatação com acrônimo de fuso
const formattedTime = classDateTime.toLocaleTimeString("pt-BR", {
  timeZone: recipientTimezone, // timezone do DESTINATÁRIO
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short', // ex: "15:00 BRT"
});
```

#### 5.1.1 `send-class-reminders/index.ts`

Os emails de lembrete formatam datas com `timeZone: "America/Sao_Paulo"` hardcoded (linhas 164-174):

```typescript
const formattedDate = classDateTime.toLocaleDateString("pt-BR", {
  timeZone: "America/Sao_Paulo", // HARDCODED
});
```

**Ação**: Email de lembrete vai para o **aluno**. Buscar timezone do aluno via `student_id` → `profiles.timezone`. Substituir pelo timezone do destinatário (aluno).

**Impacto no cron schedule**: Mínimo — a busca de aulas nas "próximas 24h" usa `timestamptz` e a comparação funciona em qualquer fuso. Apenas a formatação nos emails precisa de ajuste.

#### 5.1.2 `send-class-confirmation-notification/index.ts`

2 ocorrências de `timeZone: "America/Sao_Paulo"` na formatação de data/hora da aula confirmada.

**Ação**: Email de confirmação pode ir para professor e/ou aluno. Buscar timezone do **destinatário** e usar na formatação.

#### 5.1.3 `send-cancellation-notification/index.ts`

1 ocorrência de `timeZone: 'America/Sao_Paulo'` na formatação de data/hora do cancelamento.

**Ação**: Email de cancelamento pode ir para professor e/ou aluno. Buscar timezone do **destinatário** e usar na formatação.

#### 5.1.4 `send-invoice-notification/index.ts`

1 ocorrência de `timeZone: "America/Sao_Paulo"` na formatação de `due_date`.

**Ação**: Email de fatura vai para o **aluno**. Buscar timezone do aluno via `student_id` → `profiles.timezone`. **Atenção especial**: `due_date` é campo `date` (sem hora) — ao formatar com timezone, usar a técnica de "ignorar offset" para evitar o bug de exibição de dia anterior (ver memory constraint `database-date-timezone-rendering`).

#### 5.1.5 `send-class-request-notification/index.ts`

2 ocorrências de `timeZone: "America/Sao_Paulo"` na formatação de data/hora da aula solicitada.

**Ação**: Email de solicitação de aula vai para o **professor**. Buscar timezone do professor e usar na formatação.

#### 5.1.6 `send-class-report-notification/index.ts`

2 ocorrências de formatação de data/hora sem timezone (linhas 174-177):

```typescript
const formattedDate = classDate.toLocaleDateString('pt-BR');
const formattedTime = classDate.toLocaleTimeString('pt-BR', { 
  hour: '2-digit', minute: '2-digit' 
});
```

**Impacto**: Emails de notificação de relatório de aula mostram data/hora no fuso do servidor (UTC), não do professor.

**Ação**: Email de relatório vai para o **aluno**. Buscar timezone do aluno via `student_id` → `profiles.timezone` e usar na formatação.

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

**Ação**: Email de boleto vai para o **aluno/responsável**. Parametrizar `formatDate` para receber timezone e buscar do aluno.

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

**Ação**: Buscar timezone do professor e usar na formatação. Além da descrição, corrigir cálculo de `dueDate` (linha 241-252) para usar timezone do professor via `Intl.DateTimeFormat('en-CA', { timeZone })` em vez de `toISOString().split('T')[0]`.

#### 5.1.10 `create-invoice/index.ts`

1 ocorrência sem timezone na descrição de item de fatura (linha 352):

```typescript
let itemDescription = `${service?.name || 'Aula'} - ${new Date(classInfo.class_date).toLocaleDateString('pt-BR')}`;
```

**Impacto**: Descrições de itens de fatura manual com data potencialmente incorreta.

**Ação**: O `teacher_id` já está disponível no contexto. Buscar timezone e usar na formatação. Além da descrição, corrigir fallback `dueDate` (linha 199) para usar timezone do professor via `Intl.DateTimeFormat('en-CA', { timeZone })` em vez de `new Date(Date.now() + ...).toISOString().split('T')[0]`.

#### 5.1.11 `generate-teacher-notifications/index.ts`

Linha 192 — calcula "hoje" em UTC para encontrar faturas vencidas:

```typescript
const today = new Date().toISOString().split('T')[0]
const { data: overdueInvoices2 } = await supabase
  .from('invoices')
  .select('id, teacher_id')
  .eq('status', 'pendente')
  .lt('due_date', today)
```

**Problema**: Idêntico ao `check-overdue-invoices` (Passo 5.2). Usa data UTC do servidor para comparar com `due_date` (campo `date`). Para professores em fusos ocidentais (ex: UTC-5), faturas podem ser classificadas como "vencidas" antes do fim do dia local.

**Ação**: Agrupar faturas por professor, buscar timezone via `teacher_id`, e calcular "hoje" no fuso local antes de comparar com `due_date`.

#### 5.1.12 `check-pending-boletos/index.ts`

Linhas 178-186 — calcula "amanhã" em UTC para enviar lembretes de boleto:

```typescript
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(0, 0, 0, 0);
const dueDateNormalized = new Date(dueDate);
dueDateNormalized.setHours(0, 0, 0, 0);
if (dueDateNormalized.getTime() === tomorrow.getTime()) {
  // send reminder
}
```

**Problema**: "Amanhã" é calculado em UTC. Para um professor em UTC-5, às 22:00 locais do dia 1, `tomorrow` seria dia 3 em UTC (não dia 2). O lembrete pode ser enviado no dia errado ou não ser enviado.

**Impacto**: Médio — afeta apenas o timing de lembretes de boleto, não a cobrança em si.

**Ação**: Buscar timezone do professor (via `subscription.user_id` → `profiles.timezone`) e calcular "amanhã" no fuso local.

#### 5.1.13 `end-recurrence/index.ts` (v3.5)

Linha 67-72 — compara `class_date` (timestamptz) com `endDate` (string `'YYYY-MM-DD'`):

```typescript
const { data: futuresToDelete } = await supabase
  .from('classes')
  .select('id')
  .eq('class_template_id', templateId)
  .gte('class_date', endDate)  // endDate = 'YYYY-MM-DD'
  .neq('status', 'concluida');
```

**Problema**: Quando Postgres recebe `'2026-03-15'` para comparar com `timestamptz`, interpreta como `2026-03-15 00:00:00+00` (meia-noite UTC). Uma aula do dia 14 às 22:00 BRT (= `2026-03-15 01:00:00+00`) será apagada incorretamente — causando **perda de dados de histórico e faturamento**.

**Impacto**: **Alto** — deleção incorreta de aulas que já ocorreram. Afeta histórico e faturamento.

**Ação**: Buscar timezone do professor via `profiles.timezone` (já temos `user.id` no contexto). Converter `endDate` para o instante UTC correto (início do dia no timezone do professor) antes de fazer `.gte('class_date', ...)`:

```typescript
// Obter timezone do professor
const { data: teacherProfile } = await supabase
  .from('profiles')
  .select('timezone')
  .eq('id', user.id)
  .single();
const tz = teacherProfile?.timezone || 'America/Sao_Paulo';

// Converter 'YYYY-MM-DD' para instante UTC no fuso do professor
const endDateUTC = new Date(
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date(`${endDate}T00:00:00`))
).toISOString();
// Usar endDateUTC na query
.gte('class_date', endDateUTC)
```

**Alternativa mais robusta**: Usar `AT TIME ZONE` diretamente numa RPC PostgreSQL para evitar parsing JS.

---

### Passo 5.3: Refatorar Database Functions (RPCs) para Timezone-Awareness

Todas as RPCs abaixo usam `CURRENT_DATE` (que no Postgres com session timezone UTC equivale à data UTC) ou `EXTRACT` de `timestamptz` sem `AT TIME ZONE`. A correção é uniforme: adicionar parâmetro `p_timezone text DEFAULT 'America/Sao_Paulo'` e substituir `CURRENT_DATE` por `(NOW() AT TIME ZONE p_timezone)::DATE`.

#### NOTA CRÍTICA: Propagação de `p_timezone` em RPCs Encadeadas

Várias RPCs chamam outras internamente. É **obrigatório** propagar `p_timezone` em toda chamada interna, caso contrário o valor default `'America/Sao_Paulo'` será usado, anulando a correção da chamada externa.

**Árvore de dependências**:

```text
get_student_subscription_details -> count_completed_classes_in_month (DEVE propagar p_timezone)
get_subscription_assigned_students -> count_completed_classes_in_month (DEVE propagar p_timezone)
count_completed_classes_in_billing_cycle -> get_billing_cycle_dates (DEVE propagar p_timezone)
```

---

#### 5.3.1 `count_completed_classes_in_month(p_teacher_id, p_student_id, p_year, p_month)`

Usa `EXTRACT(YEAR FROM c.class_date)` e `EXTRACT(MONTH FROM c.class_date)` sobre `timestamptz`. No Postgres, `EXTRACT` de um `timestamptz` usa a timezone da sessão (UTC por default no servidor).

**Problema**: Uma aula às 23:00 BRT do dia 31/Jan = 02:00 UTC do dia 01/Fev. Seria contada em Fevereiro em vez de Janeiro para um professor BRT.

**Ação**: Adicionar parâmetro `p_timezone text DEFAULT 'America/Sao_Paulo'` e usar `EXTRACT(... FROM c.class_date AT TIME ZONE p_timezone)`.

#### 5.3.2 `get_student_subscription_details` (2 overloads)

Ambas chamam `count_completed_classes_in_month` passando `EXTRACT(YEAR FROM CURRENT_DATE)` e `EXTRACT(MONTH FROM CURRENT_DATE)`.

**Problema**: `CURRENT_DATE` no servidor é UTC. Às 22:00 BRT do dia 31/Jan, `CURRENT_DATE` no Postgres já é 01/Fev. A contagem de aulas usaria o mês errado.

**Ação**: Fazer JOIN com `profiles` para obter timezone do professor, converter `CURRENT_DATE` com `(NOW() AT TIME ZONE tz)::DATE` antes de passar ano/mês para `count_completed_classes_in_month`.

#### 5.3.3 `get_subscription_assigned_students(p_subscription_id)`

Mesmo padrão: chama `count_completed_classes_in_month` com `CURRENT_DATE` (UTC).

**Ação**: Obter timezone do professor via JOIN com `monthly_subscriptions` → `profiles` e propagar.

#### 5.3.4 `get_student_active_subscription(p_relationship_id)`

Usa `sms.ends_at > CURRENT_DATE` para filtrar subscrições ativas.

**Problema**: `ends_at` é campo `date` e `CURRENT_DATE` é `date`. A diferença máxima é de algumas horas na virada do dia UTC vs local. Para um professor em UTC-12, a subscrição poderia ser desativada até 12h antes do esperado.

**Ação**: Adicionar `p_timezone text DEFAULT 'America/Sao_Paulo'` e comparar `ends_at` com `(NOW() AT TIME ZONE p_timezone)::DATE`.

#### 5.3.5 `get_billing_cycle_dates(p_billing_day, p_reference_date DEFAULT CURRENT_DATE)`

Parâmetro default `CURRENT_DATE` (UTC).

**Problema**: Quando chamada sem `p_reference_date` explícito (ex: de dentro de `count_completed_classes_in_billing_cycle`), usa a data UTC do servidor.

**Ação**: Adicionar `p_timezone text DEFAULT 'America/Sao_Paulo'` e substituir default `CURRENT_DATE` por `(NOW() AT TIME ZONE p_timezone)::DATE`.

#### 5.3.6 `count_completed_classes_in_billing_cycle(p_teacher_id, p_student_id, p_billing_day, p_reference_date DEFAULT CURRENT_DATE)`

Mesma questão do default `CURRENT_DATE` e faz `c.class_date::DATE` (cast que usa timezone da sessão = UTC).

**Ação**: Adicionar `p_timezone text DEFAULT 'America/Sao_Paulo'`, propagar para `get_billing_cycle_dates`, e substituir `c.class_date::DATE` por `(c.class_date AT TIME ZONE p_timezone)::DATE`.

#### 5.3.7 `get_teacher_notifications(...)` — cálculo de `days_overdue`

```sql
GREATEST(0, (CURRENT_DATE - i.due_date))
GREATEST(0, EXTRACT(DAY FROM (NOW() - c.class_date))::INTEGER)
```

**Problema**: `CURRENT_DATE` é UTC, `due_date` é campo `date`. Para um professor em UTC-5 às 23:00 locais, `CURRENT_DATE` no Postgres já é o dia seguinte, inflando `days_overdue` em +1.

**Ação**: Obter timezone do professor via `auth.uid()` → `profiles.timezone` e substituir `CURRENT_DATE` por `(NOW() AT TIME ZONE tz)::DATE` no cálculo de `days_overdue`.

#### Nota: `validate-monthly-subscriptions` (Script Interno) (v3.5)

A edge function `supabase/functions/validate-monthly-subscriptions/index.ts` (validação V05, linhas 148-156) invoca a RPC `count_completed_classes_in_month` usando:

```typescript
p_year: now.getFullYear(),   // UTC no Deno
p_month: now.getMonth() + 1  // UTC no Deno
```

**Problema duplo**:
1. `now.getFullYear()` e `now.getMonth()` no Deno calculam em UTC. Às 23:00 BRT do dia 31/Jan, para o Deno já é 01/Fev — testa o mês errado.
2. Quando a RPC ganhar o parâmetro `p_timezone` (Passo 5.3.1), esta função **quebrará** se não passar o novo parâmetro.

**Ação**: Ao buscar o professor para teste (linha 140), retornar também `timezone`. Calcular mês/ano local via `Intl.DateTimeFormat` com o timezone do professor, e passar `p_timezone` à RPC.

**Prioridade**: Baixa — é um script de validação interna, não afeta utilizadores. Mas deve ser atualizado junto com a migração das RPCs para evitar falsos positivos nos testes.

#### RPCs Confirmadas SEM Impacto

- `has_overdue_invoices` — compara `status = 'overdue'` (valor estático, sem cálculo de data)
- `get_unbilled_participants_v2` — recebe `p_start_date`/`p_end_date` como `timestamptz` (comparação absoluta)
- `get_classes_with_participants` — recebe `p_start_date`/`p_end_date` como `timestamptz`
- `get_calendar_events` — recebe `p_start_date`/`p_end_date` como `timestamptz`
- `create_invoice_and_mark_classes_billed` — usa `NOW()` apenas para `created_at`/`updated_at` (timestamps absolutos)
- `cascade_deactivate_subscription_students` — usa `now()` apenas para `updated_at`
- `cleanup_expired_pending_profiles` — usa `NOW()` para comparação absoluta de `expires_at` (timestamptz)
- Triggers (`sync_class_status_from_participants`, etc.) — usam `NOW()` apenas para timestamps
- `archive_old_stripe_events` — usa `NOW() - INTERVAL '90 days'` (janela relativa absoluta)

### Passo 5.4: `get-teacher-availability` — Retornar Timezone do Professor (v3.3)

#### Problema

A edge function `get-teacher-availability/index.ts` retorna `working_hours` (ex: `start_time: "09:00"`, `end_time: "18:00"`) sem contexto de timezone. Esses horários são relativos ao fuso local do professor.

No frontend (`StudentScheduleRequest.tsx`, linhas 180-187), o componente aplica esses horários diretamente ao `Date` local do aluno:

```typescript
const [startHour, startMinute] = workingHour.start_time.split(':').map(Number);
startTime.setHours(startHour, startMinute, 0, 0); // Usa timezone do ALUNO, não do professor
```

Se um aluno em Lisboa (UTC+0) tenta agendar com um professor no Brasil (UTC-3), vê a disponibilidade como 09:00-18:00 no horário de Lisboa, mas para o professor seria 06:00-15:00. O aluno pode agendar fora do expediente real.

#### Ação

| Local | Mudança |
|---|---|
| `get-teacher-availability/index.ts` | Buscar `profiles.timezone` do professor e incluir campo `teacherTimezone` na resposta JSON |
| `StudentScheduleRequest.tsx` | Converter `working_hours` do fuso do professor para o fuso do aluno antes de renderizar slots |
| `supabase/functions/request-class/index.ts` | Validar que o horário solicitado cai dentro do expediente do professor no fuso **do professor** |

---

### Passo 5.5: `materialize-virtual-class` — Comparação de Expiração Timezone-Aware (v3.3)

#### Problema

Linha 224-226 compara `recurrence_end_date` com `new Date()` (UTC):

```typescript
if (template.recurrence_end_date) {
  const endDate = new Date(template.recurrence_end_date);
  if (endDate < new Date()) { ... } // "now" em UTC
}
```

`recurrence_end_date` é `timestamptz` armazenado como `endOfDay` no fuso local do professor (conforme memory `logica-data-fim-recorrencia`). Para professores em fusos negativos profundos (ex: UTC-12), a aula pode ser considerada "expirada" prematuramente.

#### Ação

Buscar timezone do professor (dono do template, `template.teacher_id`) via `profiles.timezone` e comparar `recurrence_end_date` com "agora" no fuso local do professor:

```typescript
// Obter "agora" no timezone do professor
const teacherLocalDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: teacherTimezone,
}).format(new Date()); // 'YYYY-MM-DD'

const endDateLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: teacherTimezone,
}).format(new Date(template.recurrence_end_date));

if (endDateLocal < teacherLocalDate) {
  // Template expirado no fuso do professor
}
```

---

### Nota Técnica: DST em Aulas Recorrentes (`manage-future-class-exceptions`) (v3.3)

A aritmética de `setDate(getDate() + 7)` em `manage-future-class-exceptions/index.ts` opera em **UTC puro** no Deno runtime. No UTC não há horário de verão — a soma de +7 dias é sempre correta em termos de instante absoluto.

O risco real de DST (drift de 1h na hora exibida) afeta apenas a **apresentação no frontend**, que já está coberta pela migração dos 39 componentes no Passo 8. **Não requer refatoração** da edge function neste momento.

### Nota Técnica: RRule e DST no Frontend (v3.4)

A biblioteca `rrule` no frontend (`ClassForm.tsx`, `Agenda.tsx`) opera sobre instantes `Date` do JavaScript. Quando o **input parsing** for corrigido (v3.4, ver seção abaixo), o `dtstart` passado ao `RRule` será o instante UTC correto derivado do timezone do perfil. O `RRule` então gera ocorrências futuras como instantes UTC — sem drift de DST no armazenamento.

O risco de drift de 1h na **apresentação** das datas geradas já está coberto pela migração dos 39 componentes (Passo 8). **Não requer refatoração imediata** da biblioteca `rrule`.

### REGRA CRÍTICA: Input Parsing no Formulário de Aulas (v3.4)

Ao submeter datas de formulários, o `new Date(\`${date}T${time}\`)` usa o timezone do browser. Se o utilizador estiver fisicamente num fuso diferente do perfil (ex: professor brasileiro viajando pela Europa que recusou a atualização do `useTimezoneSync`), a aula será gravada no horário errado.

**Correção**: Usar `zonedTimeToUtc` do `date-fns-tz` para forçar o parse no timezone do perfil:

```typescript
import { zonedTimeToUtc } from 'date-fns-tz';
const classDateTime = zonedTimeToUtc(`${formData.class_date}T${formData.time}`, profile.timezone);
```

**Aplicar em**: `ClassForm.tsx` (linha 148), `Agenda.tsx` (linha 1424), `ClassExceptionForm.tsx`, `FutureClassExceptionForm.tsx`, `AvailabilityManager.tsx` (linha 134 — `handleAddBlock`).

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

> **Nota**: A mesma função também calcula faturas **próximas ao vencimento** (3 dias) usando `threeDaysFromNow.toISOString().split('T')[0]` (linhas 115-116 do `check-overdue-invoices`). Esta comparação precisa do mesmo tratamento timezone-aware para que os lembretes sejam enviados no dia correto no fuso do professor.

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
| `src/components/Calendar/CalendarView.tsx` | ~5x `moment().format()` sem timezone explícito (HH:mm, dddd DD/MM/YYYY, ddd, etc.) — migrar para utilitário timezone-aware |
| `src/components/CancellationModal.tsx` | `.toLocaleDateString()` e `.toLocaleTimeString()` sem timezone |
| `src/components/ClassReportModal.tsx` | `.toLocaleDateString('pt-BR')` e `.toLocaleTimeString('pt-BR')` sem timezone |
| `src/components/ClassReportView.tsx` | `.toLocaleDateString()` e `.toLocaleString()` sem timezone |
| `src/components/PendingBoletoModal.tsx` | `.toLocaleDateString()` sem timezone |
| `src/components/StudentScheduleRequest.tsx` | `formatDate`/`formatTime` locais sem timezone (4+ ocorrências) + **converter `working_hours` do fuso do professor para fuso do aluno** (v3.3) |
| `src/components/BusinessProfilesManager.tsx` | `.toLocaleDateString()` sem timezone |
| `src/components/Settings/CancellationPolicySettings.tsx` | `.toLocaleDateString()` sem timezone (2 ocorrências) |
| `src/pages/PainelNegocios.tsx` | `.toLocaleDateString('pt-BR')` sem timezone |
| `src/pages/Materiais.tsx` | `.toLocaleDateString()` sem timezone |
| `src/pages/MeusMateriais.tsx` | `.toLocaleDateString()` sem locale/timezone |
| `src/pages/PerfilAluno.tsx` | ~8 chamadas (datas de aulas, cadastro, nascimento, vencimento) |
| `src/pages/Financeiro.tsx` | `formatDate` local sem timezone + cálculo de `currentMonth` com `new Date().toISOString()` sem timezone (resumo de despesas pode mostrar mês errado) + função `isOverdue()` compara `due_date` (campo `date`) com data local sem timezone do perfil (pode marcar fatura como vencida 1 dia antes) |
| `src/pages/Agenda.tsx` | `.toLocaleDateString()` para descrição de fatura |
| `src/pages/Recibo.tsx` | 4x `format()` sem timezone (created_at, due_date, updated_at, hora atual) — documento oficial |
| `src/pages/Faturas.tsx` | 2x `format()` sem timezone (created_at, due_date) — bug de dia anterior em `due_date` |
| `src/pages/Historico.tsx` | `formatDateTime` sem timezone (class_date timestamptz) |
| `src/pages/Dashboard.tsx` | `startOfMonth` calculado com `new Date()` sem timezone — receita mensal pode incluir faturas do mês anterior para professores fora de BRT |
| `src/pages/StudentDashboard.tsx` | 2x `format()` sem timezone (class_date, starts_at) + cálculo de `startOfMonth` com `new Date()` sem timezone (mesmo que não usado na query atual, deve ser corrigido preventivamente) |
| `src/components/Inbox/NotificationItem.tsx` | 2x `format()` sem timezone (invoice_due_date, class_date) |
| `src/pages/Subscription.tsx` | 3x `format()` sem timezone (datas do Stripe) |
| `src/components/PlanDowngradeSelectionModal.tsx` | 1x `format()` sem timezone (created_at) |
| `src/components/MonthlySubscriptionsManager.tsx` | 1x `format()` sem timezone (`starts_at` tipo `date` — bug de dia anterior) |
| `src/components/PaymentOptionsCard.tsx` | 1x `format()` sem timezone (datas de faturas) + `isOverdue` compara `due_date` com `new Date()` sem timezone (pode marcar fatura como vencida 1 dia antes) |
| `src/components/PlanDowngradeWarningModal.tsx` | 3x `format()` sem timezone (`subscriptionEndDate` timestamptz) |
| `src/components/ArchivedDataViewer.tsx` | 2x `toLocaleString`/`toLocaleDateString` sem timezone (dados arquivados) |
| `src/components/DependentManager.tsx` | 1x `format()` sem timezone (`birth_date` tipo `date`) |
| `src/components/ExpenseList.tsx` | 1x `format()` sem timezone (`expense_date` tipo `date`) |
| `src/pages/Legal.tsx` | 1x `format()` sem timezone (`published_at` timestamptz) |
| `src/hooks/useMonthlySubscriptions.ts` | 6x `new Date().toISOString().split('T')[0]` para `starts_at`/`ends_at` — data escrita no banco pode ser dia anterior para utilizadores em fusos positivos |
| `src/components/StudentSubscriptionSelect.tsx` | 3x `format(new Date(), 'yyyy-MM-dd')` para default de `startsAt` — usa timezone do browser em vez do perfil |
| `src/components/ClassExceptionForm.tsx` | `toISOString().split('T')[0]` (UTC) + `toTimeString()` (local) — inconsistência data/hora, pré-preenche dia errado |
| `src/components/FutureClassExceptionForm.tsx` | Mesmo bug: `toISOString().split('T')[0]` (UTC) + `toTimeString()` (local) |
| `src/components/Availability/AvailabilityManager.tsx` | 1x `moment().format('DD/MM/YYYY HH:mm')` sem timezone explícito — migrar para utilitário timezone-aware (v3.3) |
| `src/components/ExpenseModal.tsx` | 1x `formatDate(new Date(), 'yyyy-MM-dd')` — default de `expense_date` usa timezone do browser em vez do perfil (v3.4) |
| `src/components/RecurringClassActionModal.tsx` | 1x `Intl.DateTimeFormat` sem `timeZone` para utilitário timezone-aware (v3.5) |
| `src/components/CreateInvoiceModal.tsx` | `parse(formData.due_date, 'yyyy-MM-dd', new Date())` + `format(date, 'yyyy-MM-dd')` + `format(parse(...), "dd 'de' MMMM, yyyy")` — usar wrappers timezone-aware (v3.6.2) |

Estes ficheiros devem ser progressivamente migrados para usar as funções de `src/utils/timezone.ts` com o timezone do utilizador (obtido via `useAuth()`).

#### REGRA ARQUITETURAL: Proibir `date-fns` nativas para matemática de datas (v3.6)

**Proibido** usar diretamente as seguintes funções do `date-fns` em componentes frontend:
- `startOfMonth`, `endOfMonth`, `startOfDay`, `endOfDay`
- `isToday`, `isSameDay`, `isSameMonth`

Estas funções operam no timezone do browser, não do perfil. **Obrigatório** criar wrappers timezone-aware em `src/utils/timezone.ts` usando `toZonedTime` do `date-fns-tz`:

```typescript
import { toZonedTime } from 'date-fns-tz';
import { startOfMonth as dfStartOfMonth, startOfDay as dfStartOfDay } from 'date-fns';

export const startOfMonthTz = (date: Date, timezone: string): Date => {
  const zonedDate = toZonedTime(date, timezone);
  return dfStartOfMonth(zonedDate);
};

export const isTodayTz = (date: Date, timezone: string): boolean => {
  const zonedNow = toZonedTime(new Date(), timezone);
  const zonedDate = toZonedTime(date, timezone);
  return dfStartOfDay(zonedNow).getTime() === dfStartOfDay(zonedDate).getTime();
};
```

#### REGRA ARQUITETURAL: Campos `date` (sem hora) no frontend (v3.6)

Mesma regra do Passo 5.1: campos `date` como `due_date`, `starts_at`, `expense_date`, `birth_date` NUNCA devem ser convertidos para `Date` e formatados com opção `timeZone`. Usar `parseISO` do date-fns ou `split('-')` para montar localmente.

**Regra de timezone para exibição**: Cada componente usa o timezone do **utilizador logado** (via `useAuth()`), independentemente de quem são os dados exibidos. O professor vê datas no seu fuso, o aluno vê no seu fuso. Para documentos oficiais como `Recibo.tsx`, aplica-se a mesma regra: se o professor acessa, vê no fuso do professor; se o aluno acessa, vê no fuso do aluno.

**Nota importante**: Nenhum componente frontend atualmente importa as funções de `timezone.ts` (`formatDateBrazil`, etc.). Todos usam `format()` do date-fns ou `toLocaleDateString` diretamente. A migração dos componentes é **pré-requisito** para que a refatoração de `timezone.ts` (Passo 8) tenha efeito prático.

**Excluído da migração**: `src/pages/DevValidation.tsx` — usa `toLocaleTimeString` apenas para timestamps de log de debug. Não impacta utilizadores.

---

## 3. Arquivos Impactados (Completo)

| Arquivo | Tipo de Mudança |
|---|---|
| Migration SQL (`profiles.timezone`) | Nova coluna |
| RPC SQL `get_relationships_to_bill_now` | Nova função PostgreSQL + tipo customizado |
| `supabase/functions/create-teacher/index.ts` | Aceitar campo timezone |
| `supabase/functions/automated-billing/index.ts` | Refatorar para hourly sweeper + timezone em `getBillingCycleDates` + **5** `toLocaleDateString` internos (inclui descrição de aulas fora do ciclo em `processMonthlySubscriptionBilling`, linha 939) + 3x cálculo de `due_date` com `toISOString().split('T')[0]` deve usar timezone do professor |
| `supabase/functions/check-overdue-invoices/index.ts` | Comparação de due_date timezone-aware |
| `supabase/functions/send-class-reminders/index.ts` | Formatação de datas com timezone do destinatário (aluno) |
| `supabase/functions/send-class-confirmation-notification/index.ts` | Substituir 2x `timeZone: "America/Sao_Paulo"` hardcoded |
| `supabase/functions/send-cancellation-notification/index.ts` | Substituir 1x `timeZone: 'America/Sao_Paulo'` hardcoded |
| `supabase/functions/send-invoice-notification/index.ts` | Substituir 1x `timeZone: "America/Sao_Paulo"` hardcoded + tratar `date` offset |
| `supabase/functions/send-class-request-notification/index.ts` | Substituir 2x `timeZone: "America/Sao_Paulo"` hardcoded |
| `supabase/functions/send-class-report-notification/index.ts` | Adicionar timezone na formatação de data/hora (2 ocorrências) |
| `supabase/functions/send-boleto-subscription-notification/index.ts` | Parametrizar `formatDate` com timezone |
| `supabase/functions/process-cancellation/index.ts` | Usar timezone na descrição de fatura |
| `supabase/functions/process-orphan-cancellation-charges/index.ts` | Usar timezone na descrição de fatura + cálculo de `due_date` deve usar timezone do professor |
| `supabase/functions/create-invoice/index.ts` | Usar timezone na descrição de item + fallback `due_date` deve usar timezone do professor |
| `supabase/functions/generate-teacher-notifications/index.ts` | Cálculo de "hoje" timezone-aware para faturas vencidas |
| `supabase/functions/check-pending-boletos/index.ts` | Cálculo de "amanhã" timezone-aware para lembretes de boleto |
| Migration SQL (refatorar 7 RPCs) | Adicionar `p_timezone` e `AT TIME ZONE` em `count_completed_classes_in_month`, `get_student_subscription_details` (2x), `get_subscription_assigned_students`, `get_student_active_subscription`, `get_billing_cycle_dates`, `count_completed_classes_in_billing_cycle`, `get_teacher_notifications` |
| `src/contexts/AuthContext.tsx` | Interface Profile + signUp payload |
| `src/contexts/ProfileContext.tsx` | Interface Profile com campo `timezone` |
| `src/hooks/useTimezoneSync.ts` | **Novo** — hook de sincronização |
| `src/utils/timezone.ts` | Refatorar funções para aceitar timezone dinâmico |
| `src/components/Layout.tsx` | Integrar hook |
| `src/components/ProfileSetup.tsx` | Enviar timezone no setup |
| `src/components/Calendar/SimpleCalendar.tsx` | Migrar datas para utilitário |
| `src/components/Calendar/MobileCalendarList.tsx` | Migrar datas para utilitário |
| `src/components/Calendar/CalendarView.tsx` | Migrar ~5x `moment().format()` para utilitário timezone-aware |
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
| `src/pages/Recibo.tsx` | Migrar 4x `format()` para utilitário timezone-aware. **ATENÇÃO**: `due_date` é campo `date` — usar `parseISO(invoice.due_date)` em vez de `new Date(invoice.due_date)` para evitar off-by-one (regra v3.6) |
| `src/pages/Faturas.tsx` | Migrar 2x `format()` para utilitário timezone-aware |
| `src/pages/Historico.tsx` | Migrar `formatDateTime` para utilitário timezone-aware |
| `src/pages/StudentDashboard.tsx` | Migrar 2x `format()` para utilitário timezone-aware |
| `src/components/Inbox/NotificationItem.tsx` | Migrar 2x `format()` para utilitário timezone-aware |
| `src/pages/Subscription.tsx` | Migrar 3x `format()` para utilitário timezone-aware |
| `src/components/PlanDowngradeSelectionModal.tsx` | Migrar 1x `format()` para utilitário timezone-aware |
| `src/components/MonthlySubscriptionsManager.tsx` | Migrar 1x `format()` para utilitário timezone-aware |
| `src/components/PaymentOptionsCard.tsx` | Migrar 1x `format()` para utilitário timezone-aware |
| `src/components/PlanDowngradeWarningModal.tsx` | Migrar 3x `format()` para utilitário timezone-aware |
| `src/components/ArchivedDataViewer.tsx` | Migrar 2x `toLocaleString`/`toLocaleDateString` para utilitário timezone-aware |
| `src/components/DependentManager.tsx` | Migrar 1x `format()` para utilitário timezone-aware |
| `src/components/ExpenseList.tsx` | Migrar 1x `format()` para utilitário timezone-aware |
| `src/pages/Legal.tsx` | Migrar 1x `format()` para utilitário timezone-aware |
| `src/hooks/useMonthlySubscriptions.ts` | Migrar 6x cálculo de data para utilitário timezone-aware |
| `src/components/StudentSubscriptionSelect.tsx` | Migrar 3x `format(new Date())` para utilitário timezone-aware |
| `src/components/ClassExceptionForm.tsx` | Migrar extração de data/hora para utilitário timezone-aware |
| `src/components/FutureClassExceptionForm.tsx` | Migrar extração de data/hora para utilitário timezone-aware |
| `src/components/Availability/AvailabilityManager.tsx` | Migrar 1x `moment().format()` para utilitário timezone-aware (v3.3) |
| `src/components/ExpenseModal.tsx` | Migrar 1x `formatDate(new Date())` para utilitário timezone-aware (v3.4) |
| `src/components/RecurringClassActionModal.tsx` | Migrar 1x `Intl.DateTimeFormat` sem `timeZone` para utilitário timezone-aware (v3.5) |
| `src/components/CreateInvoiceModal.tsx` | Migrar `format`/`parse` do date-fns para wrappers timezone-aware (v3.6.2) |
| `supabase/functions/end-recurrence/index.ts` | Converter `endDate` para UTC no fuso do professor antes de `.gte('class_date', ...)` (v3.5) |
| `supabase/functions/validate-monthly-subscriptions/index.ts` | Passar `p_timezone` à RPC e calcular mês/ano local (v3.5) |
| `supabase/functions/get-teacher-availability/index.ts` | Retornar `teacherTimezone` na resposta (v3.3) |
| `supabase/functions/materialize-virtual-class/index.ts` | Comparação de expiração timezone-aware (v3.3) |
| `supabase/functions/request-class/index.ts` | Validar horário no fuso do professor (v3.3) |
| `src/components/Settings/ProfileSettings.tsx` | Adicionar `<Select>` de timezone como escape hatch (v3.5) |
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
| Emails com horário errado para fusos não-BRT | Alta | Médio | Usar timezone do **destinatário** (aluno ou professor) — não do professor fixo (Passo 5.1, v3.3) |
| RPCs com `CURRENT_DATE` calculam data UTC em vez de local | Alta | Alto | Adicionar `p_timezone` e usar `NOW() AT TIME ZONE` (Passo 5.3) |
| `due_date` gravado 1 dia antes para professores em fusos positivos (UTC+N) | Alta | Alto | Calcular "hoje local" com `Intl.DateTimeFormat('en-CA', { timeZone })` antes de adicionar `payment_due_days` (3 edge functions: `automated-billing`, `process-orphan-cancellation-charges`, `create-invoice`) |
| Aluno agenda aula fora do expediente do professor (fusos diferentes) | Média | Alto | `get-teacher-availability` retorna `teacherTimezone`; frontend converte `working_hours` para fuso do aluno (v3.3) |
| Email de lembrete com horário no fuso errado para aluno | Alta | Alto | Usar timezone do destinatário (aluno), não do professor (v3.3) |
| Template expirado prematuramente em `materialize-virtual-class` | Baixa | Médio | Comparar com "agora" no fuso do professor (v3.3) |
| Aula gravada no UTC do browser em vez do perfil | Média | Alto | `zonedTimeToUtc` no submit de formulários (v3.4) |
| Cron billing falha e grupo de professores não cobrado | Baixa | Alto | Sweeper com `>= 1` + `NOT EXISTS` auto-corretivo (v3.4) |
| `end-recurrence` apaga aulas do dia anterior ao comparar `'YYYY-MM-DD'` com `timestamptz` | Alta | Alto | Converter `endDate` para UTC no fuso do professor antes de `.gte()` (Passo 5.1.13, v3.5) |
| `validate-monthly-subscriptions` testa mês errado em UTC | Baixa | Baixo | Calcular mês/ano local e passar `p_timezone` à RPC (v3.5) |

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
7. ⬜ Frontend: migrar 40 componentes com datas hardcoded (Passo 8, tabela — 15 originais + 7 v2.5 + 6 v2.6 + 1 v2.7 + 1 v2.8 + 1 v2.9 + 3 v3.0 + 1 v3.2 CalendarView + 1 v3.3 AvailabilityManager + 1 v3.3 StudentScheduleRequest working_hours conversion + 1 v3.4 ExpenseModal + 1 v3.5 RecurringClassActionModal + 1 v3.6.2 CreateInvoiceModal)
8. ⬜ Backend: criar RPC `get_relationships_to_bill_now` (Passo 5)
9. ⬜ Backend: refatorar `automated-billing` (Passo 5)
10. ⬜ Backend: refatorar `send-class-reminders` com timezone do destinatário (Passo 5.1.1, v3.3)
11. ⬜ Backend: refatorar notificações restantes com timezone do destinatário (Passos 5.1.2–5.1.5, v3.3)
12. ⬜ Backend: refatorar edge functions faltantes (Passos 5.1.6–5.1.10)
13. ⬜ Backend: refatorar `generate-teacher-notifications` e `check-pending-boletos` (Passos 5.1.11–5.1.12)
14. ⬜ Backend: refatorar `end-recurrence` com timezone do professor (Passo 5.1.13, v3.5)
15. ⬜ Backend: refatorar `check-overdue-invoices` (Passo 5.2)
16. ⬜ Backend: refatorar 7 RPCs de banco de dados (Passo 5.3)
17. ⬜ Backend: atualizar `validate-monthly-subscriptions` para `p_timezone` (Passo 5.3, v3.5)
18. ⬜ Backend: `get-teacher-availability` retornar `teacherTimezone` (Passo 5.4, v3.3)
19. ⬜ Backend: `materialize-virtual-class` comparação de expiração timezone-aware (Passo 5.5, v3.3)
20. ⬜ Backend: `request-class` validar horário no fuso do professor (Passo 5.4, v3.3)
21. ⬜ Frontend: adicionar escape hatch de timezone em `ProfileSettings.tsx` (Passo 3, v3.5)
22. ⬜ Cron job: alterar billing para horário (Passo 4)
23. ⬜ Validar idempotência com timezone (Passo 6)
24. ⬜ Testes end-to-end

---

## 9. Referências

- [Documentação atual de timezone](../docs/timezone-implementation.md)
- [Utilitários de timezone](../src/utils/timezone.ts)
- [IANA Time Zone Database](https://www.iana.org/time-zones)
- [`date-fns-tz` docs](https://github.com/marnusw/date-fns-tz)



# Auditoria de Queries v3.1: 1 Gap de Calculo de `due_date` em Edge Functions

## Resumo

Cruzamento das queries e calculos propostos no plano v3.1 com o codigo real. Encontrei **1 gap de logica de negocio** que afeta a escrita do campo `due_date` em 3 edge functions. Nao e um bug de formatacao visual -- e um bug de **dados gravados no banco**.

---

## Gap Encontrado: `dueDate.toISOString().split('T')[0]` gera `due_date` errado em 3 edge functions

### Onde aparece

1. **`automated-billing/index.ts`** (3 ocorrencias: linhas 499, 823, 961):

```typescript
const now = new Date();
const dueDate = new Date(now);
dueDate.setDate(dueDate.getDate() + studentInfo.payment_due_days);
// ...
due_date: dueDate.toISOString().split('T')[0], // UTC!
```

2. **`process-orphan-cancellation-charges/index.ts`** (linha 252):

```typescript
const dueDate = new Date(now);
dueDate.setDate(dueDate.getDate() + group.payment_due_days);
p_due_date: dueDate.toISOString().split('T')[0], // UTC!
```

3. **`create-invoice/index.ts`** (linha 199):

```typescript
const dueDate = body.due_date || new Date(Date.now() + paymentDueDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // UTC!
```

### Problema

Apos a refatoracao para hourly sweeper (Passo 5), o billing roda quando e 01:00 **local** do professor. Para um professor em `Asia/Tokyo` (UTC+9):

- 01:00 local = 16:00 UTC do dia **anterior**
- `new Date().toISOString().split('T')[0]` = dia anterior em UTC
- `dueDate` = dia anterior + `payment_due_days` = **1 dia a menos** do que o professor espera

Exemplo concreto:
- Professor em Tokyo, billing_day=15, payment_due_days=15
- Billing roda as 01:00 local do dia 15/Jan = 16:00 UTC do dia 14/Jan
- `dueDate` calculado: 14/Jan + 15 = **29/Jan** (deveria ser 30/Jan)
- A fatura fica com `due_date` 1 dia antes do esperado

### Impacto

- **Criticidade**: Alta -- afeta o campo `due_date` gravado no banco, que e usado por `check-overdue-invoices`, `isOverdue` no frontend, e envio de lembretes
- **Cascata**: Se o `due_date` esta errado, toda a cadeia de overdue (Passo 5.2 + Gap 1 + Gap 2 da v3.1) herda o erro

### O que o plano v3.1 cobre vs o que falta

| Edge Function | Plano cobre | Gap |
|---|---|---|
| `automated-billing` | `getBillingCycleDates` + 4x `toLocaleDateString` | 3x `dueDate.toISOString().split('T')[0]` para campo `due_date` |
| `process-orphan-cancellation-charges` | Descricao de fatura (Passo 5.1.9) | `dueDate.toISOString().split('T')[0]` para campo `due_date` |
| `create-invoice` | Descricao de item (Passo 5.1.10) | Fallback `dueDate` com `Date.now()` para campo `due_date` |

### Correcao proposta

Em cada edge function, apos obter o timezone do professor, calcular "hoje local" antes de adicionar `payment_due_days`:

```typescript
// Obter "hoje" no timezone do professor
function getLocalToday(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
  }).format(new Date()); // Retorna 'YYYY-MM-DD'
}

// Calcular due_date corretamente
const todayLocal = getLocalToday(teacherTimezone); // ex: '2026-01-15'
const dueDate = new Date(todayLocal + 'T00:00:00'); // Parse como local midnight
dueDate.setDate(dueDate.getDate() + payment_due_days);
const dueDateStr = getLocalToday(teacherTimezone); // Ou formatar diretamente
```

---

## Verificacoes Realizadas (Queries do Plano Confirmadas Corretas)

### RPCs (Passo 5.3) -- Todas as queries propostas estao corretas

| RPC | Query Atual | Proposta do Plano | Status |
|---|---|---|---|
| `count_completed_classes_in_month` | `EXTRACT(YEAR/MONTH FROM c.class_date)` sem AT TIME ZONE | Adicionar `p_timezone`, usar `AT TIME ZONE p_timezone` | Correto |
| `get_student_subscription_details` (2-param) | `EXTRACT(YEAR/MONTH FROM CURRENT_DATE)` passado para `count_completed_classes_in_month` | JOIN com profiles para timezone, propagar `p_timezone` | Correto |
| `get_student_subscription_details` (1-param, original migration) | Mesmo padrao de `CURRENT_DATE` | Mesmo fix + propagar p_timezone | Correto |
| `get_subscription_assigned_students` | `EXTRACT(YEAR/MONTH FROM CURRENT_DATE)` passado para `count_completed_classes_in_month` | JOIN com profiles via subscription -> teacher, propagar `p_timezone` | Correto |
| `get_student_active_subscription` | `sms.ends_at > CURRENT_DATE` | Adicionar `p_timezone`, comparar com `(NOW() AT TIME ZONE p_timezone)::DATE` | Correto |
| `get_billing_cycle_dates` | Default `CURRENT_DATE` | Adicionar `p_timezone`, substituir default | Correto |
| `count_completed_classes_in_billing_cycle` | `c.class_date::DATE` e chama `get_billing_cycle_dates` | Adicionar `p_timezone`, propagar, usar `AT TIME ZONE` | Correto |
| `get_teacher_notifications` | `CURRENT_DATE - i.due_date` | Buscar timezone via `auth.uid()`, substituir `CURRENT_DATE` | Correto |

### Arvore de dependencias de propagacao -- Confirmada correta

```text
get_student_subscription_details (1-param) -> count_completed_classes_in_month (p_timezone)
get_student_subscription_details (2-param) -> count_completed_classes_in_month (p_timezone)
get_subscription_assigned_students -> count_completed_classes_in_month (p_timezone)
count_completed_classes_in_billing_cycle -> get_billing_cycle_dates (p_timezone)
```

### Nova RPC `get_relationships_to_bill_now` (Passo 5) -- Query correta

A query proposta faz:
- JOIN `profiles` para obter timezone
- `EXTRACT(DAY FROM (now() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo')))`
- `EXTRACT(HOUR ...) = 1` para filtrar hora local

Verificacao: A logica esta correta. O `COALESCE` garante fallback. O filtro por hora=1 garante que cada professor so e processado 1x por dia.

### Edge Functions de Notificacao (Passos 5.1.1 a 5.1.12) -- Cobertura confirmada

Todas as 12 sub-tarefas de notificacao estao corretamente identificadas. A acao de "buscar timezone via profiles" e substituir hardcoded `timeZone: "America/Sao_Paulo"` esta correta.

### `check-overdue-invoices` (Passo 5.2) -- Leitura correta

A comparacao `now.toISOString().split('T')[0]` para **leitura** de `due_date` esta coberta. O plano propoe comparacao timezone-aware.

### Idempotencia (Passo 6) -- Logica correta

A verificacao de duplicatas em `automated-billing` (linhas 706-715) usa `cycleStart.toISOString()` e `cycleEnd.toISOString()`. Apos a refatoracao de `getBillingCycleDates` para timezone-aware, os limites do ciclo serao corretos e a idempotencia funciona.

---

## Alteracoes Propostas ao Documento

### 1. Atualizar Passo 5 -- Adicionar `dueDate` na tabela de alteracoes

Na tabela de "Alteracoes na Edge Function" do Passo 5, adicionar:

| Local | Mudanca |
|---|---|
| Calculo de `due_date` | Usar `Intl.DateTimeFormat` com timezone do professor para calcular "hoje local" antes de adicionar `payment_due_days` (3 ocorrencias: billing tradicional, mensalidade, aulas fora do ciclo) |

### 2. Atualizar Passo 5.1.9 -- `process-orphan-cancellation-charges`

Adicionar: "Alem da descricao, corrigir calculo de `dueDate` (linha 241-252) para usar timezone do professor"

### 3. Atualizar Passo 5.1.10 -- `create-invoice`

Adicionar: "Alem da descricao, corrigir fallback `dueDate` (linha 199) para usar timezone do professor"

### 4. Atualizar tabela da Secao 3 (Arquivos Impactados)

| Arquivo | Atualizar descricao |
|---|---|
| `automated-billing/index.ts` | Adicionar: "+ 3x calculo de `due_date` com `toISOString().split('T')[0]` deve usar timezone do professor" |
| `process-orphan-cancellation-charges/index.ts` | Adicionar: "+ calculo de `due_date` deve usar timezone do professor" |
| `create-invoice/index.ts` | Adicionar: "+ fallback `due_date` deve usar timezone do professor" |

### 5. Versao do documento

Atualizar para **v3.2** (v3.1 + due_date calculation fix em 3 edge functions).

### 6. Tabela de Riscos -- Adicionar novo risco

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| `due_date` gravado 1 dia antes para professores em fusos positivos (UTC+N) | Alta | Alto | Calcular "hoje local" com `Intl.DateTimeFormat` antes de adicionar `payment_due_days` |


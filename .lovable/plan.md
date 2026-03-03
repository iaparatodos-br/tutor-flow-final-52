

# Auditoria Completa v2.6: Gaps Identificados no Plano

## Resumo

Revisao profunda do documento `docs/timezone-multi-support-implementation-plan.md` v2.6 cruzando com toda a base de codigo. Encontrei **3 gaps de impacto real** e **2 riscos no fluxo planejado** que nao estao documentados.

---

## Gap 1: `src/pages/Dashboard.tsx` — Calculo de "inicio do mes" sem timezone (FRONTEND)

**Arquivo**: `src/pages/Dashboard.tsx` (linhas 74-83)

```typescript
const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0, 0, 0, 0);

const { data: paidInvoices } = await supabase
  .from('invoices')
  .select('amount')
  .eq('status', 'paga')
  .gte('updated_at', startOfMonth.toISOString());
```

**Problema**: `new Date()` usa hora local do browser. `setHours(0, 0, 0, 0)` zera no fuso local e depois `.toISOString()` converte para UTC. Para um professor em UTC+9 (Tokyo), as 01:00 local do dia 1, `startOfMonth` em UTC seria dia 31 do mes anterior as 15:00. A receita do mes incluiria faturas pagas no dia 31 do mes anterior.

**Criticidade**: Media — afeta apenas o card de "receita do mes" no dashboard, mas mostra valor incorreto.

**Acao**: Adicionar a tabela do Passo 8 e migrar para calculo timezone-aware.

---

## Gap 2: `src/pages/StudentDashboard.tsx` — Calculo de "inicio do mes" sem timezone (FRONTEND)

**Arquivo**: `src/pages/StudentDashboard.tsx` (linhas 293-295)

```typescript
const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0, 0, 0, 0);
```

**Problema**: Mesmo bug do Dashboard.tsx. Usado para contar aulas do mes do aluno. Embora o codigo atual nao use `startOfMonth` diretamente na query (usa `subscription.starts_at`), a variavel esta declarada e indica intencao de uso futuro.

**Nota**: Este arquivo ja esta listado no plano para as 2 ocorrencias de `format()`, mas o calculo de `startOfMonth` (que e um problema de **logica de query**, nao de formatacao visual) nao esta coberto.

**Criticidade**: Baixa (variavel nao usada na query atual), mas deve ser documentado.

**Acao**: Adicionar nota ao item existente de `StudentDashboard.tsx` na tabela do Passo 8.

---

## Gap 3: `supabase/functions/automated-billing/index.ts` — 4 ocorrencias de `toLocaleDateString` internas

**Verificacao**: O plano menciona na tabela de Arquivos Impactados (linha 595):
> "Refatorar para hourly sweeper + timezone em `getBillingCycleDates` + **4 `toLocaleDateString` internos**"

Isso ja esta coberto. **Nao e um gap.**

---

## Risco 1 no Fluxo: Propagacao de `p_timezone` nas RPCs encadeadas

O Passo 5.3 planeja adicionar `p_timezone` a 7 RPCs. Porem, varias delas se chamam mutuamente:

```text
get_student_subscription_details
  -> count_completed_classes_in_month(p_timezone)
  
get_subscription_assigned_students
  -> count_completed_classes_in_month(p_timezone)
  
count_completed_classes_in_billing_cycle
  -> get_billing_cycle_dates(p_timezone)
```

**Risco**: Se uma RPC chama outra sem propagar o parametro `p_timezone`, o valor default `'America/Sao_Paulo'` sera usado na chamada interna, anulando a correcao da chamada externa.

**Acao recomendada**: Adicionar uma nota explicita ao Passo 5.3 alertando que **toda chamada entre RPCs deve propagar `p_timezone`**, e listar a arvore de dependencias.

---

## Risco 2 no Fluxo: Frontend — de onde vem o timezone nos componentes?

O Passo 8 diz que os 28 componentes devem usar "o timezone do utilizador (obtido via `useAuth()`)" (linha 580). Porem, o plano nao detalha:

1. **Para componentes que mostram dados de OUTROS usuarios** (ex: `PerfilAluno.tsx` mostra datas do aluno, `MonthlySubscriptionsManager.tsx` mostra `starts_at` do aluno), qual timezone usar — o do professor logado ou o do aluno?

2. **Para `Recibo.tsx`** — e um documento oficial. Deve mostrar no timezone do professor (emissor) ou do aluno (pagador)?

**Decisao recomendada**: Usar sempre o timezone do **usuario logado** para exibicao. O recibo e emitido pelo professor, entao usa o timezone do professor. Se o aluno acessa o recibo, usa o timezone do aluno. Isso e consistente com o principio de "cada usuario ve no seu fuso".

**Acao**: Adicionar uma nota de decisao ao Passo 8 esclarecendo essa regra.

---

## Risco 3: `process-expired-subscriptions` — Data de expiracao vs timezone

**Arquivo**: `supabase/functions/process-expired-subscriptions/index.ts` (linhas 39-43)

```typescript
const now = new Date();
const { data: expiredSubsRaw } = await supabaseAdmin
  .from('user_subscriptions')
  .select(...)
  .lt('current_period_end', now.toISOString());
```

O plano marca este cron como "Baixo — Compara datas absolutas (sem acao)" na tabela de inventario de cron jobs (linha 699).

**Verificacao**: `current_period_end` e `timestamptz` e `now.toISOString()` produz UTC. A comparacao de dois `timestamptz` e **absolutamente correta** independente de timezone. **Confirmado: sem impacto.**

---

## Alteracoes Propostas ao Documento

### 1. Tabela do Passo 8 — Adicionar 1 arquivo

| Arquivo | Problema |
|---|---|
| `src/pages/Dashboard.tsx` | `startOfMonth` calculado com `new Date()` sem timezone — receita mensal pode incluir faturas do mes anterior |

### 2. Nota no item existente de `StudentDashboard.tsx`

Adicionar que alem das 2 ocorrencias de `format()`, ha um calculo de `startOfMonth` com `new Date()` sem timezone (mesmo que nao usado na query atual).

### 3. Nota no Passo 5.3 — Propagacao de `p_timezone`

Adicionar arvore de dependencias entre RPCs e alerta de que toda chamada interna deve propagar `p_timezone`:

```text
get_student_subscription_details -> count_completed_classes_in_month
get_subscription_assigned_students -> count_completed_classes_in_month  
count_completed_classes_in_billing_cycle -> get_billing_cycle_dates
```

### 4. Nota no Passo 8 — Regra de timezone para exibicao

Adicionar decisao: "Cada componente usa o timezone do **usuario logado** (via `useAuth()`), independente de quem sao os dados exibidos. O professor ve datas no seu fuso, o aluno ve no seu fuso."

### 5. Checklist item 7 — Atualizar contagem

De **28 componentes** para **29 componentes** (28 + Dashboard.tsx).


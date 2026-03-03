

# Auditoria v2.8: 2 Gaps Adicionais Identificados

## Resumo

Cruzamento do plano v2.8 com a base de codigo completa. Encontrei **2 gaps de impacto real** nao documentados no plano.

---

## Gap 1: `src/pages/Financeiro.tsx` -- Calculo de "mes atual" sem timezone (QUERY LOGIC)

**Linhas 226-230**:

```typescript
const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
// ...
.gte('expense_date', currentMonth + '-01')
.lt('expense_date', new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10))
```

**Problema**: Identico ao `Dashboard.tsx` (Gap 1 da v2.7). `new Date()` usa hora local do browser, mas `.toISOString()` converte para UTC. Para um professor em UTC+9 as 01:00 local do dia 1 de Fevereiro, `new Date().toISOString()` retorna "2026-01-31T16:00:00Z" -- o `currentMonth` seria `"2026-01"` em vez de `"2026-02"`. O resumo de despesas mostraria dados do mes anterior.

**Criticidade**: Media -- afeta o card de resumo de despesas do mes.

**Nota**: `Financeiro.tsx` ja esta listado no plano para formatacao visual (`formatDate`), mas este bug de **logica de query** nao esta coberto.

**Acao**: Adicionar nota ao item existente de `Financeiro.tsx` na tabela do Passo 8, similar ao que foi feito para `StudentDashboard.tsx`.

---

## Gap 2: `src/hooks/useMonthlySubscriptions.ts` -- 6x datas escritas no banco sem timezone

**Linhas 141, 201, 289, 332, 379, 391**:

```typescript
starts_at: new Date().toISOString().split('T')[0],  // 4 ocorrencias
ends_at: new Date().toISOString().split('T')[0],     // 2 ocorrencias
```

**Problema**: `starts_at` e `ends_at` sao campos `date` (sem hora) na tabela `student_monthly_subscriptions`. `new Date().toISOString()` converte para UTC antes de extrair a data. Para um professor em UTC+9 as 02:00 local do dia 2, `toISOString()` retorna dia 1 em UTC. O aluno seria inscrito com data de inicio "ontem".

**Criticidade**: Media -- afeta a data de inicio/fim de subscricoes de alunos. Pode causar:
- Aluno inscrito com data de inicio errada (dia anterior)
- Aluno desvinculado com data de fim errada
- Contagem de aulas no ciclo usando referencia incorreta

**Acao**: Adicionar `src/hooks/useMonthlySubscriptions.ts` como nova linha na tabela do Passo 8 e na Secao 3 (Arquivos Impactados).

---

## Exclusao Confirmada

- `src/components/SecurityMonitoringDashboard.tsx` -- pagina admin/debug com `toLocaleString('pt-BR')`. Excluido da migracao pelo mesmo criterio que `DevValidation.tsx`.

---

## Alteracoes Propostas ao Documento

### 1. Tabela do Passo 8 -- Atualizar 1 item existente + adicionar 1 novo

**Atualizar `src/pages/Financeiro.tsx`**:
De: "`formatDate` local sem timezone"
Para: "`formatDate` local sem timezone + calculo de `currentMonth` com `new Date().toISOString()` sem timezone (resumo de despesas pode mostrar mes errado)"

**Adicionar nova linha**:

| Arquivo | Problema |
|---|---|
| `src/hooks/useMonthlySubscriptions.ts` | 6x `new Date().toISOString().split('T')[0]` para `starts_at`/`ends_at` -- data escrita no banco pode ser dia anterior para usuarios em fusos positivos |

### 2. Secao 3 (Arquivos Impactados) -- Adicionar 1 linha

| Arquivo | Tipo de Mudanca |
|---|---|
| `src/hooks/useMonthlySubscriptions.ts` | Migrar 6x calculo de data para utilitario timezone-aware |

### 3. Checklist item 7 -- Atualizar contagem

De **30 componentes** para **31 componentes** (30 + useMonthlySubscriptions.ts).

### 4. Versao do documento

Atualizar para **v2.9** (v2.8 + Financeiro.tsx query logic + useMonthlySubscriptions.ts).




# Auditoria Frontend v2.5: 6 Componentes Adicionais Faltantes

## Resumo

Cruzei todos os arquivos `.tsx` do `src/` que usam `format(new Date(...))`, `toLocaleDateString` ou `toLocaleTimeString` com a tabela do Passo 8 (22 entradas atuais). Encontrei **6 arquivos com impacto real** ausentes do plano.

---

## Arquivos Ausentes

### 1. `src/components/MonthlySubscriptionsManager.tsx`
- `format(new Date(student.starts_at), 'dd/MM/yyyy')` — campo `starts_at` e tipo `date` (sujeito ao bug de dia anterior)
- **Criticidade**: Alta

### 2. `src/components/PaymentOptionsCard.tsx`
- `formatDate` com `format(new Date(dateString), "dd/MM/yyyy")` — formata datas de faturas
- **Criticidade**: Media-alta

### 3. `src/components/PlanDowngradeWarningModal.tsx`
- 3x `format(new Date(subscriptionEndDate), 'dd/MM/yyyy')` — `subscriptionEndDate` vem do Stripe (timestamptz)
- **Criticidade**: Media

### 4. `src/components/ArchivedDataViewer.tsx`
- `toLocaleString` e `toLocaleDateString` em `formatDateTime`/`formatDate` locais — dados arquivados com timestamps
- **Criticidade**: Media (dados historicos)

### 5. `src/components/DependentManager.tsx`
- `format(new Date(dateStr), 'dd/MM/yyyy')` em `birth_date` — tipo `date` (dia anterior possivel)
- **Criticidade**: Media

### 6. `src/components/ExpenseList.tsx`
- `formatDate` com `format(new Date(dateString), 'dd/MM/yyyy')` em `expense_date` — tipo `date`
- **Criticidade**: Media

---

## Excluidos (sem impacto real)

- `SecurityMonitoringDashboard.tsx` — painel admin/debug, nao afeta usuarios finais
- `CreateInvoiceModal.tsx`, `ClassForm.tsx`, `ExpenseModal.tsx`, `AvailabilityManager.tsx`, `DependentFormModal.tsx` — usam `format(parse(..., 'yyyy-MM-dd', new Date()))` em campos de input do usuario (seguro, sem dados do banco)
- `StudentSubscriptionSelect.tsx` — `format(new Date(), 'yyyy-MM-dd')` para default de campo (data local do browser e aceitavel para valor inicial)

---

## Alteracoes Propostas ao Documento

### 1. Tabela do Passo 8 — Adicionar 6 linhas

| Arquivo | Problema |
|---|---|
| `src/components/MonthlySubscriptionsManager.tsx` | 1x `format()` sem timezone (`starts_at` tipo `date` — bug de dia anterior) |
| `src/components/PaymentOptionsCard.tsx` | 1x `format()` sem timezone (datas de faturas) |
| `src/components/PlanDowngradeWarningModal.tsx` | 3x `format()` sem timezone (`subscriptionEndDate` timestamptz) |
| `src/components/ArchivedDataViewer.tsx` | 2x `toLocaleString`/`toLocaleDateString` sem timezone (dados arquivados) |
| `src/components/DependentManager.tsx` | 1x `format()` sem timezone (`birth_date` tipo `date`) |
| `src/components/ExpenseList.tsx` | 1x `format()` sem timezone (`expense_date` tipo `date`) |

### 2. Secao 3 (Arquivos Impactados) — Adicionar 6 linhas

Mesmos 6 arquivos com tipo "Migrar datas para utilitario timezone-aware".

### 3. Checklist item 7 — Atualizar contagem

De **22 componentes** para **28 componentes** (22 + 6).


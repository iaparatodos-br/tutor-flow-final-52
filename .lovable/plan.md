

# Revisao Final do Plano v3.4 — Resultado

## Metodologia

Cruzei todos os padroes sensiveis a timezone no codigo (`toLocaleDateString`, `toLocaleTimeString`, `format(new Date(...))`, `new Date().toISOString().split`, `moment()`, `formatDate(new Date())`) contra a tabela de migracao do Passo 8 e as secoes 5.1-5.5 do plano.

## Resultado

**1 gap menor encontrado. O plano v3.4 esta 99% completo.**

---

### Gap Encontrado: `src/components/ExpenseModal.tsx`

Linhas 49 e 97:
```typescript
expense_date: formatDate(new Date(), 'yyyy-MM-dd'),
```

Usa `formatDate` do `date-fns` que opera no timezone do browser para definir a data padrao de uma nova despesa. Se o professor estiver fisicamente num fuso diferente do perfil, a despesa pode ser registrada com a data errada (ex: professor em UTC+9 as 01:00 local do dia 2, browser mostra dia 2, mas perfil em BRT ainda esta no dia 1).

**Impacto**: Baixo — a despesa e criada pelo professor para seus proprios registros, e ele pode alterar a data manualmente. Mas por consistencia deve estar na tabela de migracao.

**Acao**: Adicionar `src/components/ExpenseModal.tsx` a tabela do Passo 8 (1x `formatDate(new Date())` — default de `expense_date` deve usar timezone do perfil).

---

### Arquivos Verificados e Confirmados SEM Impacto (nao precisam de migracao)

| Arquivo | Padrao | Razao para exclusao |
|---|---|---|
| `DependentFormModal.tsx` | `format(parse(birth_date, 'yyyy-MM-dd', ...))` | Display de campo `date` puro (data de nascimento). O `parse` de string `yyyy-MM-dd` e locale-independent. Sem sensibilidade a timezone. |
| `InlineDependentForm.tsx` | `format(parse(birth_date, 'yyyy-MM-dd', ...))` | Mesmo padrao — display de `birth_date`. Seguro. |
| `CreateInvoiceModal.tsx` | `format(parse(due_date, 'yyyy-MM-dd', ...))` | Display de data selecionada pelo utilizador em calendar picker. A data ja e string `yyyy-MM-dd`. Seguro. |
| `MonthlySubscriptionCard.tsx` | `Intl.NumberFormat.format(price)` | Apenas formatacao de moeda, sem datas. |
| `Dashboard.tsx` (query) | `.gte('class_date', new Date().toISOString())` | Comparacao de `timestamptz` com instante absoluto UTC — correto. |
| `StudentDashboard.tsx` (queries) | 4x `.gte('classes.class_date', new Date().toISOString())` | Mesmo padrao — comparacao absoluta de `timestamptz`. Correto. |
| `Agenda.tsx` (query) | `.gte('end_datetime', new Date().toISOString())` | Comparacao absoluta. Correto. |
| `Alunos.tsx` | `new Date().toISOString()` para `created_at` | Timestamp absoluto, sem sensibilidade a timezone. |
| `AmnestyButton.tsx` | `new Date().toISOString()` para `amnesty_granted_at` | Timestamp absoluto. |
| `ClassReportModal.tsx` (mutations) | `new Date().toISOString()` para `confirmed_at`, `created_at` | Timestamps absolutos. |

### Backend — Confirmacao

Todas as 10 edge functions com `toLocaleDateString`/`toLocaleTimeString` hardcoded estao cobertas (5.1.1-5.1.10). O `generate-teacher-notifications` (5.1.11) e `check-pending-boletos` (5.1.12) tambem. O `send-cancellation-notification` confirmado com `timeZone: 'America/Sao_Paulo'` hardcoded na linha 161 — coberto pelo 5.1.3.

---

## Alteracao Proposta ao Plano v3.4

### Unica alteracao: Adicionar `ExpenseModal.tsx` a tabela do Passo 8

Na tabela de migracao frontend, adicionar:

| Arquivo | Problema |
|---|---|
| `src/components/ExpenseModal.tsx` | 1x `formatDate(new Date(), 'yyyy-MM-dd')` — default de `expense_date` usa timezone do browser em vez do perfil |

Atualizar contagem de componentes de 37 para **38**.

Atualizar a sequencia de execucao (item 7) de "37 componentes" para "38 componentes".

---

## Conclusao

O plano v3.4 esta **essencialmente completo**. O unico gap e o `ExpenseModal.tsx` (impacto baixo). Apos esta adicao, o plano cobrira 100% dos padroes sensiveis a timezone encontrados no codigo.


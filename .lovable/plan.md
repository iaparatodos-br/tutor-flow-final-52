

# Plano: Vincular vários alunos a uma mensalidade de uma vez

## Problema
Atualmente o `StudentSubscriptionSelect` usa um `<Select>` single-value, forçando o professor a vincular aluno por aluno. O hook `useBulkAssignStudents` já existe mas não é utilizado.

## Solução
Substituir o `<Select>` por uma lista de checkboxes, permitindo selecionar múltiplos alunos e vinculá-los de uma vez com a mesma data de início.

## Alterações

### 1. `src/components/StudentSubscriptionSelect.tsx`
- Trocar estado de `selectedRelationshipId: string` para `selectedRelationshipIds: string[]`
- Substituir o `<Select>` por uma lista com `<Checkbox>` + nome/email de cada aluno disponível
- Adicionar botão "Selecionar todos" para conveniência
- Alterar a prop `onAssign` para aceitar array: `onAssign(relationshipIds: string[], startsAt?: string)`
- Contador visual: "X aluno(s) selecionado(s)"

### 2. `src/components/MonthlySubscriptionsManager.tsx`
- Substituir `useAssignStudentToSubscription` por `useBulkAssignStudents` no fluxo de atribuição
- Adaptar `handleAssignStudent` para receber array de `relationshipIds`

### 3. `src/i18n/locales/pt/monthlySubscriptions.json` e `en/monthlySubscriptions.json`
- Adicionar chaves: `assign.selectStudents`, `assign.selectAll`, `assign.selectedCount`, `messages.studentsAssignedSuccess`, `messages.bulkUpdateError`

## UI esperada

```text
┌─────────────────────────────────────┐
│ Vincular Alunos à Mensalidade       │
│                                     │
│ ☐ Selecionar todos                  │
│ ─────────────────────────────       │
│ ☑ Ana Silva (ana@email.com)         │
│ ☑ Bruno Costa (bruno@email.com)     │
│ ☐ Carla Oliveira (carla@email.com)  │
│ ...                                 │
│                                     │
│ 📅 Data de início: 07/03/2026       │
│                                     │
│ 2 aluno(s) selecionado(s)           │
│                                     │
│         [Cancelar] [Vincular Alunos]│
└─────────────────────────────────────┘
```

## Impacto
- **2 componentes frontend editados**: `StudentSubscriptionSelect`, `MonthlySubscriptionsManager`
- **2 arquivos i18n editados**
- **0 edge functions / migrações**


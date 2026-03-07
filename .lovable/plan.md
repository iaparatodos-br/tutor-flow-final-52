
# Fix: Erro ao vincular alunos a mensalidades (duplicate key constraint)

## Problema
Dois bugs combinados:

1. **Alunos já vinculados aparecem na lista de seleção**: `useAvailableStudentsForSubscription` retorna todos os alunos com um campo `has_active_subscription`, mas o `MonthlySubscriptionsManager` passa a lista inteira sem filtrar — permitindo selecionar alunos que já têm mensalidade ativa, causando o erro `23505` (unique constraint violation).

2. **Chave i18n ausente**: O hook usa `messages.bulkUpdateError`, `messages.bulkUpdateSuccess`, `messages.studentsAssignedSuccess`, `messages.studentsRemovedSuccess` mas essas chaves não existem nos JSONs.

## Alterações

### 1. `src/components/MonthlySubscriptionsManager.tsx` (linha ~330)
Filtrar `availableStudents` para remover quem já tem `has_active_subscription: true`:

```tsx
availableStudents={(availableStudents || []).filter(s => !s.has_active_subscription)}
```

### 2. `src/i18n/locales/pt/monthlySubscriptions.json`
Adicionar as chaves faltantes em `messages`:
- `bulkUpdateSuccess`: "Alunos atualizados com sucesso"
- `bulkUpdateError`: "Erro ao atualizar alunos em lote"
- `studentsAssignedSuccess`: "{{count}} aluno(s) vinculado(s) com sucesso"
- `studentsRemovedSuccess`: "{{count}} aluno(s) removido(s) com sucesso"

### 3. `src/i18n/locales/en/monthlySubscriptions.json`
Mesmas chaves em inglês:
- `bulkUpdateSuccess`: "Students updated successfully"
- `bulkUpdateError`: "Error updating students in bulk"
- `studentsAssignedSuccess`: "{{count}} student(s) assigned successfully"
- `studentsRemovedSuccess`: "{{count}} student(s) removed successfully"

## Impacto
- 3 arquivos editados, 0 migrações, 0 edge functions

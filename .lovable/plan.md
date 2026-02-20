
# Corrigir Skeleton Infinito no Menu — Violacao das Regras de Hooks

## Problema

O console mostra o erro critico:
```
React has detected a change in the order of Hooks called by SubscriptionProvider
```

A causa raiz esta em `src/contexts/SubscriptionContext.tsx` (linhas 88-94), onde `useTeacherContext()` e chamado **condicionalmente**:

```typescript
let teacherContext = null;
if (profile?.role === 'aluno') {   // <-- CONDICIONAL!
  try {
    teacherContext = useTeacherContext();  // <-- Hook chamado dentro de if
  } catch (error) { ... }
}
```

Isso viola as Regras de Hooks do React. Quando `profile` muda de `null` para `{role: 'professor'}` (ou `'aluno'`), a ordem dos hooks muda entre renders, quebrando o React e fazendo com que os estados nunca se resolvam — resultando no skeleton infinito.

## Solucao

### Arquivo: `src/contexts/SubscriptionContext.tsx`

Chamar `useTeacherContext()` **incondicionalmente** (o provider ja envolve o SubscriptionProvider no App.tsx). Depois, usar o valor apenas quando necessario.

**Substituir linhas 87-95:**

De:
```typescript
// Get teacher context conditionally
let teacherContext = null;
if (profile?.role === 'aluno') {
  try {
    teacherContext = useTeacherContext();
  } catch (error) {
    console.warn('TeacherContext not available...');
  }
}
```

Para:
```typescript
// Always call hooks unconditionally (Rules of Hooks)
const teacherContext = useTeacherContext();
```

O restante do codigo que usa `teacherContext` ja verifica `profile?.role === 'aluno'` antes de acessar os dados, entao nao precisa de nenhuma outra mudanca.

### Tambem corrigir: `src/components/AppSidebar.tsx` (linha 85)

O mesmo padrao de hook condicional existe aqui:
```typescript
const teacherContext = isAluno ? useTeacherContext() : null;
```

Substituir por:
```typescript
const teacherContext = useTeacherContext();
```

## Por Que Funciona

- `TeacherProvider` ja envolve `SubscriptionProvider` e `AppSidebar` na arvore de componentes (confirmado em `App.tsx` linhas 128-129)
- Chamar `useTeacherContext()` incondicionalmente garante que a ordem dos hooks nunca muda entre renders
- O contexto simplesmente retorna dados vazios (`teachers: []`, `selectedTeacherId: null`) quando o usuario nao e aluno — sem efeitos colaterais

## Impacto

- Corrige o skeleton infinito no menu
- Corrige o erro de "change in the order of Hooks" no console
- Mantem o comportamento de mostrar a aba "Faturas" consistentemente para alunos
- Nenhuma migration SQL necessaria

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| `src/contexts/SubscriptionContext.tsx` | Chamar `useTeacherContext()` incondicionalmente |
| `src/components/AppSidebar.tsx` | Chamar `useTeacherContext()` incondicionalmente |

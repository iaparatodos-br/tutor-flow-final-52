
# Corrigir Aba de Faturas Inconsistente para Alunos

## Problema

A aba "Faturas" aparece e desaparece de forma inconsistente no menu lateral quando logado como aluno. Isso acontece por uma **condicao de corrida (race condition)** entre dois carregamentos assincronos:

1. O `AppSidebar` verifica `loading` do `useAuth()` (linha 93) para decidir quando renderizar o menu
2. A funcao `hasTeacherFeature('financial_module')` depende de `teacherPlan`, que e carregado pelo `SubscriptionContext` **depois** que o auth termina de carregar
3. Quando o sidebar renderiza, `teacherPlan` ainda pode ser `null`, fazendo `hasTeacherFeature` retornar `false` e escondendo a aba

```text
Timeline do problema:

Auth loading = true  -->  Auth loading = false  -->  teacherPlan carrega
     [skeleton]             [menu renderiza]          [tarde demais!]
                            teacherPlan = null
                            hasTeacherFeature = false
                            aba "Faturas" = OCULTA
```

## Solucao

### Arquivo: `src/components/AppSidebar.tsx`

1. **Importar `loading` do `useSubscription()`** junto com `hasFeature` e `hasTeacherFeature`
2. **Adicionar a verificacao de loading da subscription** na condicao de loading do sidebar (linha 93)

Mudanca na linha 79-83:
```typescript
const {
  currentPlan,
  hasFeature,
  hasTeacherFeature,
  loading: subscriptionLoading  // <-- adicionar
} = useSubscription();
```

Mudanca na linha 93:
```typescript
// Antes:
if (loading || !profile || !isProfessor && !isAluno) {

// Depois:
if (loading || subscriptionLoading || !profile || !isProfessor && !isAluno) {
```

Isso garante que o sidebar so renderiza os itens de menu **depois** que o `teacherPlan` ja foi carregado, eliminando a race condition.

## Impacto

- Enquanto a subscription do professor carrega, o aluno vera o skeleton do sidebar (por mais ~200-500ms)
- Quando renderizar, a aba "Faturas" aparecera de forma consistente se o professor tiver o modulo financeiro
- Nenhum outro arquivo precisa ser alterado
- Nenhuma migration SQL necessaria

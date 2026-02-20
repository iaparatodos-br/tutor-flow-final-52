

# Corrigir Race Condition da Aba "Faturas" para Alunos

## Problema Real (mais profundo que o diagnostico anterior)

O `SubscriptionContext.loading` fica `false` **antes** do `teacherPlan` ser carregado corretamente. Isso acontece porque:

```text
1. loadSubscription() inicia
2.   -> chama loadTeacherSubscriptions()
3.      -> teacherContext.selectedTeacherId = null (TeacherContext ainda carregando)
4.      -> teacherPlan = free plan (incorreto)
5. loading = false  <-- sidebar renderiza, aba "Faturas" OCULTA
6. TeacherContext termina de carregar, selectedTeacherId = "guilherme..."
7. useEffect reativo dispara loadTeacherSubscriptions() novamente
8.   -> teacherPlan = Premium (correto, mas tarde demais -- sidebar ja renderizou)
9. Sidebar re-renderiza COM a aba (mas usuario ja viu sem)
```

O problema e que entre os passos 5 e 9, o sidebar mostra o menu sem a aba "Faturas". Se o re-render do passo 9 acontecer rapido, o usuario ve um "flash". Se demorar, a aba simplesmente nao aparece ate um reload.

## Solucao

Duas mudancas coordenadas:

### 1. Arquivo: `src/contexts/SubscriptionContext.tsx`

Adicionar um estado `teacherPlanLoading` que fica `true` enquanto o plano do professor esta sendo carregado, e expor esse estado no contexto.

**Adicionar estado (apos linha 77):**
```typescript
const [teacherPlanLoading, setTeacherPlanLoading] = useState(false);
```

**Modificar `loadTeacherSubscriptions` (linhas 231-278):**
- Adicionar `setTeacherPlanLoading(true)` no inicio
- Adicionar `setTeacherPlanLoading(false)` no finally

**Modificar o useEffect reativo (linhas 670-674):**
```typescript
useEffect(() => {
  if (profile?.role === 'aluno' && teacherContext && plans.length > 0) {
    setTeacherPlanLoading(true);
    loadTeacherSubscriptions().finally(() => setTeacherPlanLoading(false));
  }
}, [teacherContext?.selectedTeacherId, plans, profile]);
```

**Expor no contexto (interface e provider value):**
- Adicionar `teacherPlanLoading: boolean` na interface `SubscriptionContextType`
- Adicionar `teacherPlanLoading` no value do Provider

### 2. Arquivo: `src/components/AppSidebar.tsx`

**Extrair `teacherPlanLoading` do `useSubscription()` (linhas 79-83):**
```typescript
const {
  currentPlan,
  hasFeature,
  hasTeacherFeature,
  teacherPlanLoading
} = useSubscription();
```

**Modificar a condicao de loading do sidebar (linha 93):**
```typescript
// Antes:
if (loading || !profile || !isProfessor && !isAluno) {

// Depois:
const isSubscriptionLoading = isAluno && teacherPlanLoading;
if (loading || isSubscriptionLoading || !profile || (!isProfessor && !isAluno)) {
```

Isso garante que:
- Para **alunos**, o sidebar mostra skeleton ate que o `teacherPlan` esteja carregado
- Para **professores**, nenhum atraso adicional (teacherPlanLoading nao se aplica)

## Por Que Essa Solucao e Melhor

A solucao anterior (usar `loading` do subscription) nao funcionaria porque `loading` ja e `false` quando o segundo `useEffect` dispara o carregamento do plano do professor. Precisamos de um estado dedicado (`teacherPlanLoading`) que rastreie especificamente esse carregamento assincrono.

## Impacto

- Alunos verao o skeleton do sidebar por ~200-500ms extras enquanto o plano do professor carrega
- Quando o menu renderizar, a aba "Faturas" aparecera de forma consistente
- Professores nao sao afetados (sem atraso adicional)
- Nenhuma migration SQL necessaria

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| `src/contexts/SubscriptionContext.tsx` | Adicionar estado `teacherPlanLoading`, expor no contexto |
| `src/components/AppSidebar.tsx` | Usar `teacherPlanLoading` na condicao de loading |


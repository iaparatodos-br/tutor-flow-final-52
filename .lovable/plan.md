
# Corrigir Aba "Faturas" Desaparecendo para Alunos — Refatoracao Robusta

## Diagnostico

Existem **3 problemas fundamentais** causando a inconsistencia:

### Problema 1: Alunos chamam `check-subscription-status` desnecessariamente
A funcao `loadSubscription` (linha 104) chama a Edge Function `check-subscription-status` para TODOS os usuarios, incluindo alunos. Essa funcao retorna **401** para alunos (eles nao tem subscription propria), causando o erro `"Timeout no carregamento inicial"` apos 5 segundos.

### Problema 2: Stale closure na chamada de `loadTeacherSubscriptions`
Dentro de `loadSubscription` (linha 214-216), apos o timeout de 5 segundos, o codigo chama `loadTeacherSubscriptions()`. Porem, essa funcao usa `teacherContext?.selectedTeacherId` capturado no inicio da funcao — que ainda era `null` quando `loadSubscription` comecou. Resultado: mesmo 5 segundos depois (quando o TeacherContext ja selecionou um professor), a funcao le o valor antigo e faz early return com plano gratuito.

Evidencia nos logs:
```text
TeacherContext: Using persisted teacher selection: 51a6b44b...  (professor selecionado!)
...
No teacher selected    (stale closure! le valor antigo)
...
Error loading subscription: Error: Timeout no carregamento inicial
```

### Problema 3: `hasTeacherFeature` retorna `false` com `teacherPlan = freePlan`
Quando `loadTeacherSubscriptions` faz early return com `freePlan`, o `teacherPlan` fica com `financial_module: false`. O AppSidebar filtra a aba "Faturas" com `hasTeacherFeature('financial_module')`, que retorna `false`.

## Solucao

Refatorar `loadSubscription` para **nao chamar a Edge Function para alunos** e **remover a chamada de `loadTeacherSubscriptions` de dentro de `loadSubscription`**.

### Arquivo: `src/contexts/SubscriptionContext.tsx`

#### Mudanca 1: Skip edge function para alunos (linhas 104-224)

No inicio de `loadSubscription`, adicionar um early return para alunos que apenas define o plano gratuito como currentPlan e sai. A subscricao do professor sera carregada pelo useEffect reativo na linha 669.

```typescript
const loadSubscription = async () => {
  if (!user) return;

  // Students don't have their own subscription - skip edge function call
  // Teacher subscription is loaded reactively via useEffect + loadTeacherSubscriptions
  if (profile?.role === 'aluno') {
    const freePlan = plans.find(p => p.slug === 'free');
    setCurrentPlan(freePlan || null);
    setSubscription(null);
    return;
  }

  // ... rest of the function (only for professors) ...
```

#### Mudanca 2: Remover chamada redundante (linhas 213-216)

Remover o bloco que chama `loadTeacherSubscriptions()` de dentro de `loadSubscription`:

```typescript
// REMOVER estas linhas:
// Load teacher's plan if user is a student
if (profile?.role === 'aluno') {
  await loadTeacherSubscriptions();
}
```

Isso elimina completamente o problema de stale closure.

#### Mudanca 3: Garantir que o useEffect reativo seja robusto (linhas 668-673)

O useEffect existente ja cuida do carregamento reativo:

```typescript
useEffect(() => {
  if (profile?.role === 'aluno' && teacherContext && plans.length > 0) {
    loadTeacherSubscriptions();
  }
}, [teacherContext?.selectedTeacherId, plans, profile]);
```

Este useEffect continuara funcionando. Quando `selectedTeacherId` mudar de `null` para um ID valido, ele sera disparado novamente e carregara o plano correto do professor (Premium com `financial_module: true`).

## Fluxo Corrigido

```text
1. Pagina carrega
2. loadPlans() carrega os planos
3. useEffect [user, plans, profile] dispara loadSubscription()
4. loadSubscription() detecta role='aluno', define currentPlan=free, retorna imediatamente
5. loading = false (via .finally)
6. Sidebar renderiza com menu (sem skeleton infinito)
7. TeacherContext carrega professores, seleciona o primeiro
8. useEffect [selectedTeacherId] dispara loadTeacherSubscriptions()
9. Carrega subscription do professor → teacherPlan = Premium (financial_module: true)
10. hasTeacherFeature('financial_module') = true → aba "Faturas" aparece
```

## Impacto

- Elimina o erro "Timeout no carregamento inicial" para alunos
- Elimina a chamada 401 desnecessaria a `check-subscription-status`
- Elimina o stale closure na leitura de `selectedTeacherId`
- Menu carrega instantaneamente para alunos (sem esperar 5s de timeout)
- Aba "Faturas" aparece consistentemente apos o professor ser selecionado
- Nenhuma migration SQL necessaria

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| `src/contexts/SubscriptionContext.tsx` | Early return para alunos em `loadSubscription` + remover chamada redundante de `loadTeacherSubscriptions` |

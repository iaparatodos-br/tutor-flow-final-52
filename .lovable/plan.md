

# Corrigir teacherPlanLoading preso em true (skeleton infinito)

## Causa Raiz

Na funcao `loadTeacherSubscriptions` em `src/contexts/SubscriptionContext.tsx`, o early return na linha 237 (quando nenhum professor esta selecionado) nao reseta `teacherPlanLoading` para `false`. Como esse return acontece **antes** do bloco `try/finally`, o `finally` na linha 274 nunca executa.

Fluxo do bug:
```text
1. Pagina carrega, loadTeacherSubscriptions() e chamado
2. setTeacherPlanLoading(true)           -- linha 228
3. selectedTeacherId = null              -- TeacherContext ainda carregando
4. Early return sem resetar loading      -- linha 237  BUG
5. teacherPlanLoading = true para sempre
6. Sidebar fica em skeleton infinito     -- linha 95 do AppSidebar
```

## Correcao

### Arquivo: `src/contexts/SubscriptionContext.tsx`

Adicionar `setTeacherPlanLoading(false)` antes do early return na linha 237.

**Linhas 233-238 — de:**
```typescript
if (!selectedTeacherId) {
  console.log('No teacher selected');
  const freePlan = plans.find(p => p.slug === 'free');
  setTeacherPlan(freePlan || null);
  return;
}
```

**Para:**
```typescript
if (!selectedTeacherId) {
  console.log('No teacher selected');
  const freePlan = plans.find(p => p.slug === 'free');
  setTeacherPlan(freePlan || null);
  setTeacherPlanLoading(false);
  return;
}
```

## Impacto

- Corrige o skeleton infinito no F5
- Mudanca de 1 linha
- Sem efeitos colaterais — o useEffect reativo (linha 668) vai disparar novamente quando `selectedTeacherId` mudar, carregando o plano correto
- Nenhuma migration SQL necessaria

## Arquivo Afetado

| Arquivo | Mudanca |
|---|---|
| `src/contexts/SubscriptionContext.tsx` | Adicionar `setTeacherPlanLoading(false)` no early return |

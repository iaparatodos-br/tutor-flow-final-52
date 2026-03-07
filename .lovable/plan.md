

# Fix: Adicionar scroll no modal de visualizar alunos vinculados

## Problema
O `DialogContent` do "View Students" não tem limite de altura na área da tabela. Com muitos alunos, o modal cresce além da viewport sem scroll.

## Solução
Envolver a `<Table>` em uma `div` com `max-h-72 overflow-y-auto` (mesma abordagem usada no `StudentSubscriptionSelect`).

## Alteração

### `src/components/MonthlySubscriptionsManager.tsx` (linha 266)
Trocar:
```tsx
<div className="py-4">
```
Por:
```tsx
<div className="py-4 max-h-[60vh] overflow-y-auto">
```

Isso limita a área de conteúdo a 60% da viewport e habilita scroll nativo quando a lista de alunos excede esse espaço.

## Impacto
- 1 linha alterada, 1 arquivo


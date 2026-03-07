

# Fix: ScrollArea não rola na lista de alunos

## Problema
O `ScrollArea` do Radix precisa que o conteúdo interno esteja dentro de um container com altura definida. Atualmente `max-h-56` está no Root do ScrollArea, mas o Viewport interno não recebe essa restrição — o Radix ScrollArea só habilita scroll quando o Viewport tem overflow real.

## Solução

No `StudentSubscriptionSelect.tsx` linha 128, trocar de:

```tsx
<ScrollArea className="max-h-56">
```

Para:

```tsx
<div className="max-h-56 overflow-y-auto">
```

Usar `overflow-y-auto` nativo em vez do Radix `ScrollArea`, que tem problemas conhecidos com `max-h` em containers dinâmicos. Alternativa: manter `ScrollArea` mas adicionar uma `div` interna com altura fixa — porém a solução mais simples e confiável é o overflow nativo.

## Impacto
- **1 linha alterada** em `StudentSubscriptionSelect.tsx`


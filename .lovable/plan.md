

# Fix: Aulas nao carregam ao trocar de mes no calendario

## Causa raiz

O `handleVisibleRangeChange` em `Agenda.tsx` (linha 267) e uma funcao inline sem `useCallback`. Isso cria uma nova referencia a cada render do componente.

No `SimpleCalendar.tsx`, o `useEffect` (linha 224) depende de `onVisibleRangeChange`:

```text
useEffect -> [currentDate, onVisibleRangeChange]
```

Como `onVisibleRangeChange` muda a cada render do Agenda:

```text
1. Agenda renderiza -> handleVisibleRangeChange e uma nova funcao
2. SimpleCalendar recebe nova prop -> useEffect dispara -> chama onVisibleRangeChange(start, end)
3. setVisibleRange cria novo objeto -> Agenda re-renderiza
4. Volta ao passo 1 -> loop infinito
5. O debounce de 300ms e resetado a cada ciclo -> loadClasses NUNCA executa
```

O resultado: ao navegar entre meses, o debounce e cancelado repetidamente e a requisicao de aulas nunca chega a ser feita. Apenas um F5 (que reseta tudo e usa o carregamento inicial sem debounce) funciona.

## Correcao

### `src/pages/Agenda.tsx` - uma unica mudanca

Envolver `handleVisibleRangeChange` em `useCallback` com dependencias vazias (a funcao so usa `setVisibleRange`, que e estavel):

```typescript
// ANTES (linha 267):
const handleVisibleRangeChange = (start: Date, end: Date) => {
  setVisibleRange({ start, end });
};

// DEPOIS:
const handleVisibleRangeChange = useCallback((start: Date, end: Date) => {
  setVisibleRange({ start, end });
}, []);
```

Com a referencia estavel, o useEffect do SimpleCalendar so dispara quando `currentDate` realmente muda (usuario clica nas setas de navegacao), nao em cada re-render do Agenda.

## Arquivo impactado

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Agenda.tsx` | Adicionar `useCallback` ao `handleVisibleRangeChange` |


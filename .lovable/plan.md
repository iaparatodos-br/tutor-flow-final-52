

## Corrigir cores de status no SimpleCalendar.tsx

### Problema encontrado
O componente `SimpleCalendar.tsx` (que e o calendario realmente renderizado na rota `/agenda`) **nunca foi atualizado** nas alteracoes anteriores. Ele ainda usa as cores antigas:

- `pendente`: `bg-warning text-warning-foreground`
- `confirmada`: `bg-primary text-primary-foreground`
- `cancelada`: `bg-destructive text-destructive-foreground`
- `concluida`: `bg-success text-success-foreground`
- `aguardando_pagamento`: `bg-amber-500 text-white`

Os arquivos `CalendarView.tsx` e `MobileCalendarList.tsx` ja foram atualizados, mas o `SimpleCalendar.tsx` foi ignorado.

### Solucao

Atualizar a funcao `getStatusColor()` no arquivo `src/components/Calendar/SimpleCalendar.tsx` (linha 256-265) para usar o novo sistema de cores:

```typescript
const getStatusColor = (status: string) => {
  const colors = {
    pendente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    confirmada: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    cancelada: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
    concluida: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    aguardando_pagamento: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400'
  };
  return colors[status as keyof typeof colors] || colors.pendente;
};
```

### Arquivo a alterar
- **`src/components/Calendar/SimpleCalendar.tsx`** (linhas 256-265) -- unica alteracao necessaria

### Resultado
Todos os blocos de aulas no calendario da agenda mostrarao as cores corretas: amber para pendente, indigo para aguardando pagamento, blue para confirmada, emerald para concluida, e slate para cancelada.

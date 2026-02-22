

## Diferenciar cores dos status "Pendente" e "Aguardando Pagamento"

### Problema
Os status "pendente" e "aguardando_pagamento" compartilham a mesma cor amarela/laranja (warning/amber) em varios pontos da interface, tornando impossivel distingui-los visualmente.

### Solucao
Manter "pendente" com a cor amarela/warning atual e mudar "aguardando_pagamento" para uma cor distinta. A cor escolhida sera **amber-600/orange** mais escuro e saturado, criando uma diferenciacao clara enquanto mantem a semantica de "item financeiro pendente".

- **Pendente**: amarelo/warning (cor atual, inalterada)
- **Aguardando Pagamento**: laranja mais forte (`bg-orange-500 text-white`)

### Arquivos a alterar

1. **`src/components/Calendar/CalendarView.tsx`** (~linha 144)
   - Mudar `aguardando_pagamento` de `'hsl(30 80% 55%)'` para `'hsl(25 95% 53%)'` (laranja mais forte/distinto)

2. **`src/components/Calendar/MobileCalendarList.tsx`** (~linha 111)
   - Mudar `aguardando_pagamento` de `'bg-amber-500 text-white'` para `'bg-orange-500 text-white'`

3. **`src/pages/PerfilAluno.tsx`** (~linha 497-498)
   - `pendente`: manter `bg-warning text-warning-foreground`
   - `aguardando_pagamento`: mudar de `variant="warning"` para `className="bg-orange-500 text-white"`

4. **`src/pages/Historico.tsx`** (~linha 184-185)
   - `pendente`: manter `variant: "secondary"`
   - `aguardando_pagamento`: mudar de `variant: "warning"` para usar className com `bg-orange-500 text-white` (precisara retornar JSX customizado em vez de usar variant)

5. **`src/components/Calendar/CalendarView.tsx`** (~linha 190)
   - Badge do popup: mudar `aguardando_pagamento` de `variant: "warning"` para usar className `bg-orange-500 text-white`

6. **`src/components/ArchivedDataViewer.tsx`** (~linha 114-120)
   - Adicionar entrada para `aguardando_pagamento` com estilo diferenciado, caso esteja ausente

### Resultado visual
| Status | Cor |
|---|---|
| Pendente | Amarelo (warning - atual) |
| Aguardando Pagamento | Laranja forte (orange-500) |
| Confirmada | Azul (primary) |
| Concluida | Verde (success) |
| Cancelada | Vermelho (destructive) |


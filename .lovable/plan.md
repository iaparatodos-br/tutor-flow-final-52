

## Plano: Alerta de conflito abre ao clicar (alem de hover)

### Problema

O icone de conflito amarelo no calendario usa `Tooltip`, que so aparece ao passar o mouse (hover). Em dispositivos moveis ou ao clicar, nada acontece.

### Solucao

Substituir o `Tooltip` por `Popover` nos dois componentes do calendario. O `Popover` abre tanto ao clicar quanto pode ser configurado para abrir no hover. Isso garante que o professor veja a mensagem ao tocar/clicar no icone.

### Alteracoes

**Arquivo**: `src/components/Calendar/SimpleCalendar.tsx`
- Substituir `TooltipProvider > Tooltip > TooltipTrigger > TooltipContent` pelo `Popover > PopoverTrigger > PopoverContent` do shadcn/ui
- Manter o mesmo icone `AlertTriangle` com fundo amarelo como trigger
- O `PopoverContent` tera a mesma mensagem de conflito, com estilo compacto

**Arquivo**: `src/components/Calendar/MobileCalendarList.tsx`
- Mesma substituicao de `Tooltip` para `Popover` no icone de conflito do header do dia
- Importante para mobile onde hover nao existe

### Detalhes Tecnicos

O componente `Popover` do shadcn/ui ja esta disponivel no projeto (`src/components/ui/popover.tsx`). A troca e direta:

```text
Antes:  TooltipProvider > Tooltip > TooltipTrigger + TooltipContent
Depois: Popover > PopoverTrigger + PopoverContent (side="top", className compacto)
```

O `PopoverTrigger` recebera `asChild` e envolve o mesmo `div` com o icone. O `PopoverContent` tera padding reduzido e largura automatica para manter o visual compacto similar ao tooltip.


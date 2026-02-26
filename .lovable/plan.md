
# Corrigir Scroll no TimePicker

## Problema
As colunas de horas e minutos no seletor de tempo usam o componente `ScrollArea` do Radix UI, que dentro de um `Popover` (tambem Radix) pode ter conflitos de captura de eventos de scroll, impedindo a rolagem.

## Solucao
Substituir o `ScrollArea` por uma `div` simples com `overflow-y: auto` e altura fixa. Isso elimina o conflito entre os dois componentes Radix e garante scroll nativo funcional.

## Alteracoes

### `src/components/ui/time-picker.tsx`

1. Remover import do `ScrollArea`
2. Substituir os dois `<ScrollArea className="h-[200px] ...">` por `<div className="h-[200px] overflow-y-auto ...">`
3. Manter todo o restante do componente inalterado

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/ui/time-picker.tsx` | Trocar ScrollArea por div com overflow-y-auto nas colunas de hora e minuto |

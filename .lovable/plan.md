
# Corrigir hover no TimePicker nao sobrescrever item selecionado

## Problema
Ao passar o mouse sobre o horario ja selecionado nas colunas de hora/minuto, o estilo de hover (`hover:bg-accent hover:text-accent-foreground`) sobrescreve o destaque de selecao (`bg-primary text-primary-foreground`), fazendo o item selecionado perder sua cor.

## Solucao
Condicionar o hover para ser aplicado apenas nos itens **nao selecionados**. O item selecionado mantera suas cores fixas independentemente do hover.

## Alteracao

### `src/components/ui/time-picker.tsx`

Nos botoes de hora e minuto, mover as classes de hover para o branch nao-selecionado:

```text
// De:
"hover:bg-accent hover:text-accent-foreground",
hasValue && hours === i
  ? "bg-primary text-primary-foreground font-semibold"
  : "text-foreground"

// Para:
hasValue && hours === i
  ? "bg-primary text-primary-foreground font-semibold"
  : "text-foreground hover:bg-accent hover:text-accent-foreground"
```

Mesma mudanca aplicada nos botoes de minuto.

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/ui/time-picker.tsx` | Mover classes de hover para o branch nao-selecionado nos botoes de hora e minuto |

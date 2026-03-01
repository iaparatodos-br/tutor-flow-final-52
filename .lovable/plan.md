

## Tornar o botao de anistia maior e mais chamativo

### Alteracao

**`src/components/AmnestyButton.tsx`**

Atualizar o estilo dos dois `Button` (billed e normal) para serem mais visiveis:

- Trocar `variant="outline"` por um estilo customizado com fundo amber/laranja
- Adicionar classes Tailwind: `bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 hover:border-amber-400 font-semibold px-6 py-3 h-auto text-base`
- Aumentar icones de `h-5 w-5` para `h-6 w-6`
- Manter `size="lg"` mas adicionar `h-auto` para permitir padding customizado

Isso aplica a ambos os botoes (linha 115-123 e linha 137-145).


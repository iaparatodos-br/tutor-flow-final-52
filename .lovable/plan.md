

## Corrigir overflow do badge "Aguardando Pagamento" no card de faturas

### Problema
O container da fatura (linha 959) usa `flex items-center justify-between` sem controle de overflow. Em telas estreitas, o badge e o botao "Ver Fatura" nao cabem e vazam para fora do card.

### Solucao

**Arquivo**: `src/pages/PerfilAluno.tsx`

1. **Tornar o layout responsivo** - Alterar o container de cada fatura (linha 959) de `flex items-center justify-between` para `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`, permitindo empilhamento vertical em telas pequenas.

2. **Adicionar `min-w-0`** ao `<div>` de texto (linha 960) para permitir truncamento correto.

3. **Adicionar `flex-shrink-0`** ao `<div>` de acoes (linha 971) para evitar que os botoes sejam comprimidos.

4. **Adicionar `flex-wrap`** ao container de badge + botao (linha 971) para que o badge e o botao "Ver Fatura" quebrem linha se necessario.

### Detalhes tecnicos

```
// Linha 959 - Container da fatura
- <div className="flex items-center justify-between p-3 border border-border rounded-lg">
+ <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-border rounded-lg">

// Linha 960 - Texto
- <div>
+ <div className="min-w-0">

// Linha 971 - Acoes
- <div className="flex items-center gap-2">
+ <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
```

Essas mudancas garantem que em telas pequenas os elementos empilhem verticalmente, e em telas maiores mantenham o layout horizontal original.


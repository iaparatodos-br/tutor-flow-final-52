
## Plano: Atualizar resumo financeiro ao cadastrar despesa

### Problema
Quando uma despesa e cadastrada, editada ou removida no `ExpenseList`, os cards de resumo no topo da pagina (Despesas, Lucro Liquido) nao atualizam. Isso acontece porque `Financeiro.tsx` carrega o resumo de despesas apenas uma vez no mount, e o `ExpenseList` gerencia seu estado de forma independente.

### Solucao
Passar a funcao `loadExpenseSummary` do `Financeiro.tsx` como callback para o `ExpenseList`, que a chamara sempre que houver alteracao nas despesas.

### Alteracoes

**Arquivo: `src/components/ExpenseList.tsx`**
- Adicionar uma prop `onExpensesChanged?: () => void`
- Chamar `onExpensesChanged()` apos cada operacao que altera despesas: criar, editar e deletar (nos mesmos pontos onde ja chama `loadExpenses()`)

**Arquivo: `src/pages/Financeiro.tsx`**
- Passar `onExpensesChanged={loadExpenseSummary}` ao componente `<ExpenseList />`

### Detalhes Tecnicos

No `ExpenseList`, a prop sera chamada em 3 pontos:
1. No callback `onExpenseAdded` passado ao `ExpenseModal` (apos criar/editar)
2. No `handleDelete` apos deletar com sucesso

No `Financeiro.tsx`, basta adicionar a prop na linha onde o `ExpenseList` e renderizado (dentro da aba de despesas).

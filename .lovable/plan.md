

## Remover taxa de boleto do calculo de lucro liquido

### Contexto
Atualmente, o calculo de lucro liquido desconta R$ 3,49 por cada fatura paga (taxa do Stripe por boleto). Porem, como o professor pode desabilitar boletos e marcar pagamentos manualmente como pagos, nao ha garantia de que a taxa foi realmente cobrada. O calculo deve ser simplificado para **Receitas - Despesas**.

### Alteracoes

**Arquivo: `src/pages/Financeiro.tsx`**

1. **Remover calculo de `stripeFees`** (linha 397): Eliminar a variavel `const stripeFees = paidInvoices.length * 3.49;`

2. **Simplificar calculo de `netProfit`** (linha 400): Alterar de `totalPago - stripeFees - expenseSummary.total` para `totalPago - expenseSummary.total`

3. **Manter o texto descritivo** (linha 500): Ja diz "Receitas - Despesas", nao precisa alterar

O alerta de transparencia de taxas do Stripe (linhas 420-447) sera mantido, pois continua sendo informacao util para o professor saber que a taxa existe — apenas nao sera mais usada no calculo do lucro liquido.

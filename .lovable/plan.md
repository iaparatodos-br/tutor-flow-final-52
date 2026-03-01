
## Corrigir deadlock do StripeAccountGuard no Financeiro

### Problema
O `StripeAccountGuard` envolve todo o conteudo da pagina `/financeiro` (linhas 417-816), incluindo a aba "Contas de Recebimento" (`BusinessProfilesManager`). Quando o professor nao tem conta Stripe, ele ve apenas o alerta de bloqueio e nao consegue acessar o formulario para cadastrar sua conta -- um deadlock.

### Solucao
Mover o `StripeAccountGuard` para envolver apenas os componentes que realmente precisam de conta Stripe ativa (criacao de faturas, tabela de faturas, cards de resumo), deixando a aba "Contas de Recebimento" sempre acessivel.

### Alteracoes

**Arquivo: `src/pages/Financeiro.tsx`**

1. Remover o `StripeAccountGuard` que envolve todo o conteudo (linhas 417 e 816)
2. Mover o guard para envolver apenas os elementos que dependem de conta Stripe ativa:
   - O alerta de taxas Stripe
   - Os cards de resumo financeiro
   - O botao "Nova Fatura" (`CreateInvoiceModal`)
   - A tabela de faturas
3. Manter fora do guard (sempre acessiveis):
   - As abas de navegacao (Receitas, Despesas, Contas de Recebimento)
   - A aba "Contas de Recebimento" com o `BusinessProfilesManager`
   - A aba "Despesas" com o `ExpenseList`

Na pratica, o `StripeAccountGuard` sera aplicado dentro da `TabsContent` de "receitas", envolvendo o conteudo de faturas e criacao de faturas. As abas de despesas e contas de recebimento ficarao livres do guard.

### Detalhes Tecnicos

Estrutura resultante simplificada:

```text
FeatureGate
  |-- Cards de resumo (sem guard, apenas exibicao)
  |-- Tabs
       |-- TabsContent "receitas"
       |    |-- StripeAccountGuard
       |         |-- CreateInvoiceModal
       |         |-- Tabela de faturas
       |-- TabsContent "despesas"
       |    |-- ExpenseList (sem guard)
       |-- TabsContent "contas"
            |-- BusinessProfilesManager (sem guard)
```

Os cards de resumo no topo ficam visiveis sem guard pois sao apenas leitura. O guard bloqueia apenas as acoes que requerem conta Stripe ativa (criar fatura, gerar boleto).



## Remover botao ativar/desativar dos cards de Servicos e Mensalidades

### Problema
Os cards de servicos e mensalidades exibem um botao de ativar/desativar diretamente na listagem. Essa opcao ja existe dentro do modal de edicao, tornando o botao no card redundante e poluindo a interface.

### Alteracoes

**1. `src/components/ClassServicesManager.tsx`**
- Remover o botao "Ativar/Desativar" do card de cada servico (linhas ~155-162)
- Manter apenas os botoes de editar

**2. `src/components/MonthlySubscriptionCard.tsx`**
- Remover o botao de ativar/desativar (linhas 99-115)
- Remover imports nao utilizados (`ToggleLeft`, `ToggleRight`)
- Manter botoes de ver alunos e editar

**3. `src/components/MonthlySubscriptionsManager.tsx`**
- Remover a funcao `handleToggleActive` e o state/dialog de confirmacao de desativacao (`deactivateConfirm`), ja que nao serao mais chamados pelo card
- Remover o `AlertDialog` de confirmacao de desativacao
- Remover o prop `onToggleActive` passado ao `MonthlySubscriptionCard`

Nota: A funcionalidade de ativar/desativar continuara disponivel dentro dos modais de edicao de servico (`ServiceModal`) e mensalidade (`MonthlySubscriptionModal`), sem perda de funcionalidade.


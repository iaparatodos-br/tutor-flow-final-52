

# Unificacao dos Modais de Falha de Pagamento e Selecao de Alunos

## Problema Atual

Existem 3 modais separados para cenarios muito semelhantes:

1. **PaymentFailureModal** - Mostra quando ha falha de pagamento, com botoes "Renovar" e "Downgrade". Se o usuario clica em "Downgrade", ele precisa de um SEGUNDO modal.
2. **PaymentFailureStudentSelectionModal** - Modal de selecao de alunos especifico para falha de pagamento.
3. **PlanDowngradeSelectionModal** - Modal de selecao de alunos para downgrade normal, JA possui abas "Selecionar Alunos" e "Fazer Upgrade".

O fluxo atual para falha de pagamento requer 2 cliques em 2 modais diferentes, quando poderia ser resolvido em 1 so.

## Solucao Proposta

Unificar tudo no `PlanDowngradeSelectionModal`, que ja tem a melhor estrutura (abas com opcao de upgrade e selecao de alunos). A parte de selecao de alunos so aparece se houver alunos excedentes.

```text
+-------------------------------------------+
| Modal Unificado                           |
|-------------------------------------------|
| [Alerta contextual]                       |
|   - Falha de pagamento? Alerta vermelho   |
|   - Downgrade normal? Alerta amarelo      |
|-------------------------------------------|
| [Selecionar Alunos] | [Renovar/Upgrade]   |  <-- Abas
|                                           |
| Aba "Selecionar Alunos":                  |
|   - So aparece se currentCount > limit    |
|   - Lista de alunos com checkbox          |
|   - Mesma logica atual                    |
|                                           |
| Aba "Renovar/Upgrade":                    |
|   - Lista de planos disponiveis           |
|   - Botao de checkout do Stripe           |
|   - Sempre visivel                        |
+-------------------------------------------+
```

## Detalhes Tecnicos

### 1. Modificar `PlanDowngradeSelectionModal`

- Adicionar prop `isPaymentFailure?: boolean` para adaptar textos e alertas
- Quando `isPaymentFailure = true`:
  - Titulo: "Falha de Pagamento - Acao Necessaria"
  - Alerta vermelho explicando a falha
  - Mencao a cancelamento de faturas pendentes
- Quando `isPaymentFailure = false`:
  - Manter comportamento atual (downgrade normal)
- Quando **nao ha alunos excedentes** (`needToRemove <= 0`):
  - Esconder aba "Selecionar Alunos"
  - Mostrar apenas aba "Renovar/Upgrade" com opcao de downgrade direto (botao simples)
- A edge function chamada no submit depende do contexto:
  - `isPaymentFailure = true` -> chama `process-payment-failure-downgrade`
  - `isPaymentFailure = false` -> chama `handle-plan-downgrade-selection`

### 2. Simplificar `SubscriptionContext.tsx`

- Remover os estados `paymentFailureDetected` e `paymentFailureData` separados
- Quando ha falha de pagamento, alimentar diretamente o `studentSelectionData` com `isPaymentFailure: true` (ja acontece parcialmente)
- A funcao `handlePaymentFailure` deixa de existir; o modal unificado trata tudo
- Manter a deteccao de `paymentFailure` na resposta do `check-subscription-status`, mas converter para o formato de `studentSelectionData`

### 3. Remover arquivos obsoletos

- Deletar `src/components/PaymentFailureModal.tsx`
- Deletar `src/components/PaymentFailureGuard.tsx`
- Deletar `src/components/PaymentFailureStudentSelectionModal.tsx`

### 4. Atualizar `StudentSelectionBlocker.tsx`

- Remover a bifurcacao `isPaymentFailure ? PaymentFailureStudentSelectionModal : PlanDowngradeSelectionModal`
- Sempre renderizar `PlanDowngradeSelectionModal`, passando `isPaymentFailure` como prop

### 5. Atualizar `Layout.tsx` ou onde `PaymentFailureGuard` e usado

- Remover a renderizacao do `PaymentFailureGuard`

### 6. Atualizar traducoes (i18n)

- Adicionar chaves no namespace `subscription` para os textos contextuais de falha de pagamento dentro do modal unificado

## Cenarios Cobertos

| Cenario | Alunos Excedentes? | Resultado |
|---|---|---|
| Falha de pagamento, 18 alunos, limite 3 | Sim | Modal com 2 abas: selecionar alunos + upgrade |
| Falha de pagamento, 2 alunos, limite 3 | Nao | Modal com 1 aba: upgrade/downgrade direto |
| Downgrade normal (basico->free), 18 alunos | Sim | Modal com 2 abas: selecionar alunos + upgrade |
| Downgrade normal, 2 alunos | Nao | Nao mostra modal (downgrade direto) |

## Riscos

Nenhum risco funcional. A logica de selecao de alunos, as edge functions e o fluxo de upgrade permanecem identicos. Apenas a apresentacao e unificada.


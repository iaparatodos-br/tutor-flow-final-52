

## Reposicionar Botao de Salvar na Aba de Cobranca

### Problema
O botao "Salvar Configuracoes" esta posicionado dentro do segundo card ("Configuracoes de Cobranca"), dando a impressao de que salva apenas os campos daquele card. Na verdade, ele tambem salva o "Modelo de Cobranca" (prepaid/postpaid) do primeiro card.

### Solucao
Mover o botao de submit para fora de ambos os cards, posicionando-o no final da pagina como uma acao global. Isso deixa claro que ele salva todas as configuracoes da tela.

### Mudancas Tecnicas

**Arquivo: `src/components/Settings/BillingSettings.tsx`**

1. Remover o `<form>` de dentro do segundo card e envolver os dois cards em um unico `<form>` no nivel raiz do componente
2. Mover o `<Button type="submit">` para fora dos cards, posicionado abaixo de ambos com um separador visual
3. Adicionar `sticky bottom-0` ou padding adequado para destaque

Estrutura resultante:
```text
+------------------------------------------+
| [Card 1] Modelo de Cobranca              |
|   Prepaid / Postpaid                     |
+------------------------------------------+

+------------------------------------------+
| [Card 2] Configuracoes de Cobranca       |
|   Prazo de Vencimento                    |
|   Dia de Cobranca Padrao                 |
+------------------------------------------+

        [ Salvar Todas as Configuracoes ]
```

A logica de `onSubmit` permanece identica -- ja salva tanto o `chargeTiming` no `business_profiles` quanto os campos do formulario no `profiles`. Apenas a posicao visual do botao muda.

### Arquivos Modificados
- `src/components/Settings/BillingSettings.tsx` -- reestruturar form wrapper e reposicionar botao


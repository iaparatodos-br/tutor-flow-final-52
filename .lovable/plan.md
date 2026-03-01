

## Implementacao: Corrigir categorias de despesas + adicionar gerenciamento

### Resumo
O `ExpenseModal` usa o `CategoryModal` de materiais, que salva na tabela `material_categories` em vez de `expense_categories`. Alem disso, nao ha UI para excluir categorias. A correcao envolve 5 alteracoes:

### Alteracoes

**1. Novo arquivo: `src/components/ExpenseCategoryModal.tsx`**
- Modal identico ao `CategoryModal`, mas apontando para `expense_categories`
- Sem campo description (tabela `expense_categories` nao tem essa coluna)
- Usa namespace `expenses` para traducoes

**2. Novo arquivo: `src/components/ExpenseCategoryManager.tsx`**
- Dialog que lista todas as categorias de despesa do professor
- Botoes de editar e excluir para cada categoria (exceto defaults)
- AlertDialog de confirmacao antes de excluir
- Botao para criar nova categoria

**3. Atualizar `src/components/ExpenseModal.tsx`**
- Linha 10: trocar import de `CategoryModal` por `ExpenseCategoryModal`
- Linha 398: trocar `<CategoryModal>` por `<ExpenseCategoryModal>`

**4. Atualizar `src/components/ExpenseList.tsx`**
- Adicionar import do `ExpenseCategoryManager`
- Adicionar state `categoryManagerOpen`
- Adicionar botao "Gerenciar Categorias" (icone Settings) ao lado do filtro de categoria
- Renderizar `<ExpenseCategoryManager>` com callback para recarregar categorias

**5. Adicionar traducoes em ambos idiomas**

`src/i18n/locales/pt/expenses.json` - adicionar:
```json
"categoryModal": {
  "newTitle": "Nova Categoria de Despesa",
  "editTitle": "Editar Categoria",
  "name": "Nome",
  "namePlaceholder": "Nome da categoria",
  "nameRequired": "Nome é obrigatório",
  "color": "Cor",
  "preview": "Prévia",
  "previewPlaceholder": "Nome da categoria",
  "created": "Categoria criada com sucesso",
  "updated": "Categoria atualizada com sucesso",
  "saveError": "Erro ao salvar categoria"
},
"categoryManager": {
  "title": "Gerenciar Categorias",
  "newCategory": "Nova Categoria",
  "default": "padrão",
  "deleted": "Categoria excluída com sucesso",
  "deleteError": "Erro ao excluir categoria",
  "confirmDeleteTitle": "Excluir categoria?",
  "confirmDeleteDescription": "A categoria \"{{name}}\" será excluída permanentemente. Despesas já cadastradas com essa categoria não serão afetadas.",
  "deleteAction": "Excluir"
}
```

`src/i18n/locales/en/expenses.json` - adicionar equivalentes em ingles.


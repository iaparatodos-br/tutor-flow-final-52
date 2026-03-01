

## Problemas identificados

### Problema 1: CategoryModal salva na tabela errada
O `ExpenseModal` reutiliza o `CategoryModal` (linha 398), mas esse componente foi criado para **materiais** e insere/atualiza na tabela `material_categories` (linha 79-98 do CategoryModal). As despesas usam a tabela `expense_categories`. Resultado: ao criar uma "nova categoria" dentro do modal de despesa, ela vai para a tabela errada e nunca aparece no dropdown de categorias de despesas.

### Problema 2: Sem funcionalidade de excluir categorias de despesas
Nenhum componente permite ao professor excluir (ou gerenciar) categorias de despesas. O `ExpenseList` carrega categorias para filtro, mas nao oferece CRUD. O botao "Gerenciar categorias" referenciado nas traduções (`category.manageCategories`) nao existe na UI.

---

## Plano de correção

### 1. Criar componente `ExpenseCategoryModal`
Novo arquivo: `src/components/ExpenseCategoryModal.tsx`

- Copia a estrutura do `CategoryModal` existente
- Aponta para a tabela `expense_categories` em vez de `material_categories`
- Usa traduções do namespace `expenses` (ja existem chaves como `category.newCategory`, `category.selectCategory`)
- Suporta criação e edição de categorias de despesas

### 2. Criar componente `ExpenseCategoryManager`
Novo arquivo: `src/components/ExpenseCategoryManager.tsx`

- Dialog/Sheet que lista todas as categorias de despesa do professor
- Permite editar (abre `ExpenseCategoryModal` com dados preenchidos)
- Permite excluir categorias (com confirmação)
- Botão para criar nova categoria

### 3. Atualizar `ExpenseModal`
Arquivo: `src/components/ExpenseModal.tsx`

- Substituir `CategoryModal` por `ExpenseCategoryModal`
- Manter o comportamento atual de recarregar categorias após criação

### 4. Adicionar botão "Gerenciar Categorias" no `ExpenseList`
Arquivo: `src/components/ExpenseList.tsx`

- Adicionar botão junto aos filtros para abrir o `ExpenseCategoryManager`
- Recarregar categorias após qualquer alteração

### 5. Adicionar traduções faltantes
Arquivos: `src/i18n/locales/pt/expenses.json` e `src/i18n/locales/en/expenses.json`

- Adicionar chaves para confirmação de exclusão de categoria, mensagens de sucesso/erro

